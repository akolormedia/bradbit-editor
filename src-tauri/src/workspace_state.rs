//! Per-project workspace state persisted outside the project folder.
//!
//! Only open session IDs, the active session and layout sizes are stored.
//! Messages and secrets remain in OpenCode/Keychain respectively.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::settings;

static STATE_LOCK: Mutex<()> = Mutex::new(());
const DEFAULT_SESSION_WIDTH: u32 = 430;
const MIN_SESSION_WIDTH: u32 = 320;
const MAX_SESSION_WIDTH: u32 = 640;

fn default_session_width() -> u32 {
    DEFAULT_SESSION_WIDTH
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLayout {
    #[serde(default = "default_session_width")]
    pub session_width: u32,
    #[serde(default = "default_true")]
    pub chat_visible: bool,
    #[serde(default = "default_true")]
    pub editor_visible: bool,
}

impl Default for WorkspaceLayout {
    fn default() -> Self {
        Self {
            session_width: DEFAULT_SESSION_WIDTH,
            chat_visible: true,
            editor_visible: true,
        }
    }
}

impl WorkspaceLayout {
    fn normalize(&mut self) {
        self.session_width = self
            .session_width
            .clamp(MIN_SESSION_WIDTH, MAX_SESSION_WIDTH);
        if !self.chat_visible && !self.editor_visible {
            self.chat_visible = true;
            self.editor_visible = true;
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorkspaceState {
    #[serde(default)]
    pub open_session_ids: Vec<String>,
    #[serde(default)]
    pub active_session_id: Option<String>,
    #[serde(default)]
    pub layout: WorkspaceLayout,
}

impl ProjectWorkspaceState {
    fn normalize(&mut self) {
        self.layout.normalize();
        if let Some(active) = &self.active_session_id {
            if !self.open_session_ids.contains(active) {
                self.active_session_id = self.open_session_ids.first().cloned();
            }
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct WorkspaceStateFile {
    #[serde(default)]
    projects: BTreeMap<String, ProjectWorkspaceState>,
}

fn state_path() -> Result<PathBuf, String> {
    Ok(settings::config_dir()?.join("workspace-state.json"))
}

pub fn load(root: &str) -> Result<ProjectWorkspaceState, String> {
    load_from(&state_path()?, root)
}

pub fn save(root: &str, state: &ProjectWorkspaceState) -> Result<(), String> {
    save_to(&state_path()?, root, state)
}

fn load_from(path: &Path, root: &str) -> Result<ProjectWorkspaceState, String> {
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ProjectWorkspaceState::default());
        }
        Err(error) => {
            return Err(format!("No se pudo leer el estado del workspace: {error}"));
        }
    };
    let file: WorkspaceStateFile = serde_json::from_str(&raw).unwrap_or_default();
    let mut state = file.projects.get(root).cloned().unwrap_or_default();
    state.normalize();
    Ok(state)
}

fn save_to(path: &Path, root: &str, state: &ProjectWorkspaceState) -> Result<(), String> {
    let _guard = STATE_LOCK
        .lock()
        .map_err(|_| "No se pudo bloquear el estado del workspace".to_string())?;
    let mut file: WorkspaceStateFile = fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    let mut normalized = state.clone();
    normalized.normalize();
    file.projects.insert(root.to_string(), normalized);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("No se pudo crear la carpeta de estado: {error}"))?;
    }
    let json = serde_json::to_string_pretty(&file).map_err(|error| error.to_string())?;
    fs::write(path, json)
        .map_err(|error| format!("No se pudo guardar el estado del workspace: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn roundtrips_state_per_project() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("workspace-state.json");
        let state = ProjectWorkspaceState {
            open_session_ids: vec!["ses_a".into(), "ses_b".into()],
            active_session_id: Some("ses_b".into()),
            layout: WorkspaceLayout {
                session_width: 500,
                chat_visible: false,
                editor_visible: true,
            },
        };
        save_to(&path, "/proyecto/a", &state).unwrap();
        assert_eq!(load_from(&path, "/proyecto/a").unwrap(), state);

        let other = ProjectWorkspaceState::default();
        assert_eq!(load_from(&path, "/proyecto/b").unwrap(), other);
    }

    #[test]
    fn missing_or_corrupt_files_fall_back_to_defaults() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("workspace-state.json");
        assert_eq!(
            load_from(&path, "/proyecto").unwrap(),
            ProjectWorkspaceState::default()
        );
        fs::write(&path, "{not-json").unwrap();
        assert_eq!(
            load_from(&path, "/proyecto").unwrap(),
            ProjectWorkspaceState::default()
        );
    }

    #[test]
    fn normalizes_layout_and_active_session() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("workspace-state.json");
        let state = ProjectWorkspaceState {
            open_session_ids: vec!["ses_a".into()],
            active_session_id: Some("ses_missing".into()),
            layout: WorkspaceLayout {
                session_width: 9000,
                chat_visible: false,
                editor_visible: false,
            },
        };
        save_to(&path, "/proyecto", &state).unwrap();
        let loaded = load_from(&path, "/proyecto").unwrap();
        assert_eq!(loaded.active_session_id.as_deref(), Some("ses_a"));
        assert_eq!(loaded.layout.session_width, MAX_SESSION_WIDTH);
        assert!(loaded.layout.chat_visible);
        assert!(loaded.layout.editor_visible);
    }
}
