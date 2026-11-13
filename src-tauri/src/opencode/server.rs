//! Process lifecycle for the Bradbit agent runtime (`bradbit serve`).
//!
//! The editor bundles `bradbit` as a Tauri sidecar and falls back to `bradbit`
//! or `opencode` on `PATH` during development. One server runs per project
//! folder on a free localhost port. The server prints a random Basic-auth
//! password on startup; it is captured in memory, never logged or returned to
//! the frontend. Killing the child closes the SSE stream, so the
//! event-forwarding thread ends naturally.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::json;
use tauri::{AppHandle, Emitter};

use super::client::OpenCodeClient;
use crate::git::redact_secrets;

pub const EVENT_NAME: &str = "bradbit-opencode-event";
pub const RUNTIME_NAME: &str = "bradbit";
const START_TIMEOUT: Duration = Duration::from_secs(15);
const MODEL_TIMEOUT: Duration = Duration::from_secs(8);
const LOG_LIMIT: usize = 40;

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const TARGET_TRIPLE: &str = "aarch64-apple-darwin";
#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
const TARGET_TRIPLE: &str = "x86_64-apple-darwin";
#[cfg(not(any(
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "macos", target_arch = "x86_64")
)))]
const TARGET_TRIPLE: &str = "";

/// Name Tauri expects for the sidecar in `src-tauri/binaries`.
fn sidecar_filename() -> String {
    if TARGET_TRIPLE.is_empty() {
        "bradbit".to_string()
    } else {
        format!("bradbit-{TARGET_TRIPLE}")
    }
}

pub struct RunningServer {
    pub root: String,
    pub base_url: String,
    password: String,
    child: Child,
    shutdown: Arc<AtomicBool>,
}

impl RunningServer {
    pub fn spawn(
        root: &str,
        env: &[(String, String)],
        config_content: Option<&str>,
    ) -> Result<Self, String> {
        let binary = find_binary()?;
        let port = free_port()?;
        let mut command = Command::new(&binary);
        command
            .args([
                "serve",
                "--hostname",
                "127.0.0.1",
                "--port",
                &port.to_string(),
            ])
            .current_dir(root)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (key, value) in env {
            command.env(key, value);
        }
        if let Some(content) = config_content {
            command.env("OPENCODE_CONFIG_CONTENT", content);
        }
        let mut child = command
            .spawn()
            .map_err(|error| format!("Could not start the Bradbit agent runtime: {error}"))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "The Bradbit agent runtime did not open stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "The Bradbit agent runtime did not open stderr".to_string())?;
        let logs = Arc::new(Mutex::new(VecDeque::new()));
        let (tx, rx) = mpsc::channel();
        spawn_log_reader(stdout, tx.clone(), Arc::clone(&logs));
        spawn_log_reader(stderr, tx, Arc::clone(&logs));

        let password = match rx.recv_timeout(START_TIMEOUT) {
            Ok(password) => password,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(start_error(
                    "The Bradbit agent runtime did not announce its session password",
                    &logs,
                ));
            }
        };

        let base_url = format!("http://127.0.0.1:{port}");
        let client = OpenCodeClient::new(&base_url, &password);
        if let Err(error) = wait_until_ready(&client, &logs) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }

        let models = match wait_for_models(|| client.list_models(), MODEL_TIMEOUT) {
            Some(models) => models,
            None => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(start_error(
                    "The Bradbit agent runtime has no models available. Connect a provider in Settings → AI and models.",
                    &logs,
                ));
            }
        };
        drop(models);

        Ok(Self {
            root: root.to_string(),
            base_url,
            password,
            child,
            shutdown: Arc::new(AtomicBool::new(false)),
        })
    }

    pub fn start_event_stream(&self, app: AppHandle) {
        let base_url = self.base_url.clone();
        let password = self.password.clone();
        let shutdown = Arc::clone(&self.shutdown);
        thread::spawn(move || {
            let client = OpenCodeClient::new(base_url, password);
            let result = client.subscribe_events(|event| {
                if shutdown.load(Ordering::Relaxed) {
                    return;
                }
                let event = super::chat::normalize_event(event);
                let _ = app.emit(EVENT_NAME, event);
            });
            if let Err(error) = result {
                if !shutdown.load(Ordering::Relaxed) {
                    let _ = app.emit(
                        EVENT_NAME,
                        json!({
                            "type": "client.stream_error",
                            "data": { "message": error }
                        }),
                    );
                }
            }
        });
    }

    pub fn client(&self) -> OpenCodeClient {
        OpenCodeClient::new(&self.base_url, &self.password)
    }
}

impl Drop for RunningServer {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Relaxed);
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn spawn_log_reader<R: Read + Send + 'static>(
    reader: R,
    tx: mpsc::Sender<String>,
    logs: Arc<Mutex<VecDeque<String>>>,
) {
    thread::spawn(move || {
        let reader = BufReader::new(reader);
        let mut tx = Some(tx);
        for line in reader.lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if let Some(password) = trimmed.strip_prefix("server password ") {
                if let Some(tx) = tx.take() {
                    let _ = tx.send(password.trim().to_string());
                }
                // Never store the password in the diagnostic ring.
                continue;
            }
            if let Ok(mut logs) = logs.lock() {
                logs.push_back(redact_secrets(trimmed));
                if logs.len() > LOG_LIMIT {
                    logs.pop_front();
                }
            }
        }
    });
}

fn wait_for_models<T, F>(mut list: F, timeout: Duration) -> Option<Vec<T>>
where
    F: FnMut() -> Result<Vec<T>, String>,
{
    let deadline = Instant::now() + timeout;
    loop {
        if let Ok(models) = list() {
            if !models.is_empty() {
                return Some(models);
            }
        }
        if Instant::now() >= deadline {
            return None;
        }
        thread::sleep(Duration::from_millis(150));
    }
}

fn wait_until_ready(
    client: &OpenCodeClient,
    logs: &Arc<Mutex<VecDeque<String>>>,
) -> Result<(), String> {
    let deadline = Instant::now() + START_TIMEOUT;
    loop {
        match client.info() {
            Ok(_) => return Ok(()),
            Err(error) if Instant::now() >= deadline => {
                return Err(start_error(
                    &format!("The Bradbit agent runtime did not respond: {error}"),
                    logs,
                ));
            }
            Err(_) => thread::sleep(Duration::from_millis(120)),
        }
    }
}

fn start_error(message: &str, logs: &Arc<Mutex<VecDeque<String>>>) -> String {
    let details = logs
        .lock()
        .ok()
        .map(|logs| logs.iter().cloned().collect::<Vec<_>>().join(" · "))
        .filter(|details| !details.is_empty())
        .unwrap_or_else(|| "no diagnostic output".to_string());
    format!("{message}. {details}")
}

fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Could not reserve a local port: {error}"))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("Could not read the local port: {error}"))
}

#[derive(Debug, Default)]
struct BinaryCandidates {
    bundled: Vec<PathBuf>,
    bradbit: Vec<PathBuf>,
    opencode: Vec<PathBuf>,
    override_path: Option<PathBuf>,
}

fn resolve_binary<F>(candidates: BinaryCandidates, works: F) -> Result<PathBuf, String>
where
    F: Fn(&Path) -> bool,
{
    for candidate in candidates
        .bundled
        .into_iter()
        .chain(candidates.bradbit)
        .chain(candidates.opencode)
    {
        if works(&candidate) {
            return Ok(candidate);
        }
    }

    if let Some(path) = candidates.override_path {
        if works(&path) {
            return Ok(path);
        }
        return Err(format!(
            "BRADBIT_OPENCODE_BIN does not point to an executable Bradbit runtime: {}",
            path.display()
        ));
    }

    Err(
        "The Bradbit agent runtime was not found. Reinstall Bradbit or set BRADBIT_OPENCODE_BIN to a bradbit/opencode executable."
            .to_string(),
    )
}

fn bundled_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(executable) = std::env::current_exe() {
        if let Some(directory) = executable.parent() {
            candidates.push(directory.join(RUNTIME_NAME));
            candidates.push(directory.join(sidecar_filename()));
        }
    }
    #[cfg(debug_assertions)]
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(sidecar_filename()),
    );
    candidates
}

fn path_candidates() -> (Vec<PathBuf>, Vec<PathBuf>) {
    let mut bradbit = vec![PathBuf::from(RUNTIME_NAME)];
    let mut opencode = vec![PathBuf::from("opencode")];
    if let Some(paths) = std::env::var_os("PATH") {
        for directory in std::env::split_paths(&paths) {
            bradbit.push(directory.join(RUNTIME_NAME));
            opencode.push(directory.join("opencode"));
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        bradbit.push(home.join(".bradbit/bin").join(RUNTIME_NAME));
        bradbit.push(home.join(".local/bin").join(RUNTIME_NAME));
        opencode.push(home.join(".opencode/bin/opencode"));
        opencode.push(home.join(".local/bin/opencode"));
    }
    bradbit.push(PathBuf::from("/opt/homebrew/bin").join(RUNTIME_NAME));
    bradbit.push(PathBuf::from("/usr/local/bin").join(RUNTIME_NAME));
    opencode.push(PathBuf::from("/opt/homebrew/bin/opencode"));
    opencode.push(PathBuf::from("/usr/local/bin/opencode"));
    (bradbit, opencode)
}

pub fn find_binary() -> Result<PathBuf, String> {
    let (bradbit, opencode) = path_candidates();
    resolve_binary(
        BinaryCandidates {
            bundled: bundled_candidates(),
            bradbit,
            opencode,
            override_path: std::env::var_os("BRADBIT_OPENCODE_BIN").map(PathBuf::from),
        },
        version_works,
    )
}

fn version_works(path: &Path) -> bool {
    Command::new(path)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn path(value: &str) -> PathBuf {
        PathBuf::from(value)
    }

    fn available(values: &[&str]) -> impl Fn(&Path) -> bool {
        let values: HashSet<PathBuf> = values.iter().map(PathBuf::from).collect();
        move |candidate| values.contains(candidate)
    }

    fn candidates(
        bundled: &[&str],
        bradbit: &[&str],
        opencode: &[&str],
        override_path: Option<&str>,
    ) -> BinaryCandidates {
        BinaryCandidates {
            bundled: bundled.iter().map(PathBuf::from).collect(),
            bradbit: bradbit.iter().map(PathBuf::from).collect(),
            opencode: opencode.iter().map(PathBuf::from).collect(),
            override_path: override_path.map(PathBuf::from),
        }
    }

    #[test]
    fn bundled_sidecar_wins_over_paths_and_override() {
        let resolved = resolve_binary(
            candidates(
                &["/app/bradbit"],
                &["/usr/local/bin/bradbit"],
                &["/usr/local/bin/opencode"],
                Some("/opt/bradbit"),
            ),
            available(&[
                "/app/bradbit",
                "/usr/local/bin/bradbit",
                "/usr/local/bin/opencode",
                "/opt/bradbit",
            ]),
        )
        .unwrap();
        assert_eq!(resolved, path("/app/bradbit"));
    }

    #[test]
    fn bradbit_path_wins_over_opencode_and_override() {
        let resolved = resolve_binary(
            candidates(
                &[],
                &["/usr/local/bin/bradbit"],
                &["/usr/local/bin/opencode"],
                Some("/opt/bradbit"),
            ),
            available(&[
                "/usr/local/bin/bradbit",
                "/usr/local/bin/opencode",
                "/opt/bradbit",
            ]),
        )
        .unwrap();
        assert_eq!(resolved, path("/usr/local/bin/bradbit"));
    }

    #[test]
    fn opencode_is_the_optional_fallback_before_the_override() {
        let resolved = resolve_binary(
            candidates(
                &[],
                &["/usr/local/bin/bradbit"],
                &["/usr/local/bin/opencode"],
                Some("/opt/bradbit"),
            ),
            available(&["/usr/local/bin/opencode", "/opt/bradbit"]),
        )
        .unwrap();
        assert_eq!(resolved, path("/usr/local/bin/opencode"));
    }

    #[test]
    fn override_is_used_when_no_default_is_available() {
        let resolved = resolve_binary(
            candidates(&[], &[], &[], Some("/opt/bradbit")),
            available(&["/opt/bradbit"]),
        )
        .unwrap();
        assert_eq!(resolved, path("/opt/bradbit"));
    }

    #[test]
    fn invalid_override_reports_its_path() {
        let error = resolve_binary(
            candidates(&[], &[], &[], Some("/missing/bradbit")),
            available(&[]),
        )
        .unwrap_err();
        assert!(error.contains("BRADBIT_OPENCODE_BIN"));
        assert!(error.contains("/missing/bradbit"));
    }

    #[test]
    fn missing_runtime_returns_an_actionable_error() {
        let error = resolve_binary(candidates(&[], &[], &[], None), available(&[])).unwrap_err();
        assert!(error.contains("Reinstall Bradbit"));
        assert!(error.contains("BRADBIT_OPENCODE_BIN"));
    }

    #[test]
    fn waits_for_models_that_load_after_the_server_is_ready() {
        let mut calls = 0;
        let models = wait_for_models(
            || {
                calls += 1;
                if calls < 3 {
                    Ok(Vec::<String>::new())
                } else {
                    Ok(vec!["deepseek-flash".to_string()])
                }
            },
            Duration::from_secs(1),
        );
        assert_eq!(models, Some(vec!["deepseek-flash".to_string()]));
        assert!(calls >= 3);
    }

    #[test]
    fn returns_none_when_models_never_appear() {
        let models = wait_for_models(|| Ok(Vec::<String>::new()), Duration::from_millis(20));
        assert_eq!(models, None);
    }

    #[test]
    fn sidecar_filename_matches_the_target_triple() {
        if TARGET_TRIPLE.is_empty() {
            assert_eq!(sidecar_filename(), "bradbit");
        } else {
            assert_eq!(sidecar_filename(), format!("bradbit-{TARGET_TRIPLE}"));
        }
    }

    #[test]
    #[ignore = "requires the real Bradbit/OpenCode binary and a configured model"]
    fn real_server_starts_creates_a_session_and_stops() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("notas.md"), "# Notas\n").unwrap();
        let root = dir.path().to_str().unwrap();
        let server =
            RunningServer::spawn(root, &[], None).expect("start the Bradbit agent runtime");
        let session = server
            .client()
            .create_session("Test")
            .expect("create session");
        assert!(session.id.starts_with("ses_"));
        assert_eq!(server.root, root);
        drop(server);
    }
}
