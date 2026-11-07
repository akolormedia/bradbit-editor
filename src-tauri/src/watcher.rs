use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

pub const FS_CHANGE_EVENT: &str = "bradbit-fs-change";
const DEBOUNCE_MS: u64 = 200;
const MAX_PATHS: usize = 256;
const IGNORED_NAMES: &[&str] = &[".git", ".DS_Store", "node_modules", "target", "dist"];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FsChangeEvent {
    /// Project-relative paths that changed.
    pub paths: Vec<String>,
}

#[derive(Default)]
pub struct WatcherState(pub Mutex<Option<WatcherService>>);

pub struct WatcherService {
    _debouncer: Debouncer<RecommendedWatcher>,
}

impl WatcherService {
    pub fn start<F>(root: &str, on_change: F) -> Result<Self, String>
    where
        F: Fn(FsChangeEvent) + Send + 'static,
    {
        let root_path = std::fs::canonicalize(root)
            .map_err(|e| format!("Could not watch folder '{}': {}", root, e))?;
        if !root_path.is_dir() {
            return Err(format!("La ruta '{}' no es una carpeta", root));
        }

        let handler_root = root_path.clone();
        let mut debouncer = new_debouncer(
            Duration::from_millis(DEBOUNCE_MS),
            move |result: DebounceEventResult| {
                let Ok(events) = result else {
                    return;
                };
                let changed: Vec<PathBuf> = events.into_iter().map(|event| event.path).collect();
                let paths = relative_changed_paths(&handler_root, &changed);
                if !paths.is_empty() {
                    on_change(FsChangeEvent { paths });
                }
            },
        )
        .map_err(|e| format!("No se pudo iniciar el watcher: {}", e))?;

        debouncer
            .watcher()
            .watch(&root_path, RecursiveMode::Recursive)
            .map_err(|e| format!("No se pudo vigilar '{}': {}", root, e))?;

        Ok(Self {
            _debouncer: debouncer,
        })
    }
}

/// Converts raw watcher paths into deduplicated project-relative paths,
/// ignoring Git internals and build/dependency folders.
pub fn relative_changed_paths(root: &Path, paths: &[PathBuf]) -> Vec<String> {
    let mut result = Vec::new();
    for path in paths {
        let Ok(relative) = path.strip_prefix(root) else {
            continue;
        };
        if relative.as_os_str().is_empty() {
            continue;
        }
        if relative.components().any(|component| {
            if let Component::Normal(name) = component {
                let name = name.to_string_lossy();
                IGNORED_NAMES.iter().any(|ignored| name == *ignored)
            } else {
                false
            }
        }) {
            continue;
        }
        let normalized = relative.to_string_lossy().replace('\\', "/");
        if normalized.is_empty() || result.contains(&normalized) {
            continue;
        }
        result.push(normalized);
        if result.len() >= MAX_PATHS {
            break;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use tempfile::tempdir;

    #[test]
    fn relative_paths_ignore_git_and_build_folders_and_dedupe() {
        let dir = tempdir().unwrap();
        let outside = tempdir().unwrap();
        let root = dir.path();
        let paths = vec![
            root.join("notas.md"),
            root.join("biblia/premisa.md"),
            root.join("notas.md"),
            root.join(".git/index"),
            root.join("node_modules/pkg/index.js"),
            root.join("target/debug/app"),
            root.join("dist/index.js"),
            outside.path().join("fuera.md"),
        ];

        assert_eq!(
            relative_changed_paths(root, &paths),
            vec!["notas.md".to_string(), "biblia/premisa.md".to_string()]
        );
    }

    #[test]
    fn watcher_emits_debounced_relative_paths() {
        let dir = tempdir().unwrap();
        let (sender, receiver) = mpsc::channel();
        let _service = WatcherService::start(dir.path().to_str().unwrap(), move |event| {
            let _ = sender.send(event);
        })
        .unwrap();

        // Give the platform watcher a moment to install its hooks.
        std::thread::sleep(Duration::from_millis(300));
        std::fs::write(dir.path().join("notas.md"), "hola").unwrap();

        let event = receiver
            .recv_timeout(Duration::from_secs(5))
            .expect("watcher event");
        assert!(event.paths.iter().any(|path| path == "notas.md"));
    }
}
