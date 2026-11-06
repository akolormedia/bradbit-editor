//! Process lifecycle for `opencode serve`.
//!
//! One server runs per project folder on a free localhost port. The server
//! prints a random Basic-auth password on startup; it is captured in memory,
//! never logged or returned to the frontend. Killing the child closes the SSE
//! stream, so the event-forwarding thread ends naturally.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::json;
use tauri::{AppHandle, Emitter};

use super::client::OpenCodeClient;
use super::OpenCodeSession;
use crate::git::redact_secrets;

pub const EVENT_NAME: &str = "bradbit-opencode-event";
const START_TIMEOUT: Duration = Duration::from_secs(15);
const LOG_LIMIT: usize = 40;

pub struct RunningServer {
    pub root: String,
    pub session: OpenCodeSession,
    pub base_url: String,
    password: String,
    child: Child,
    shutdown: Arc<AtomicBool>,
}

impl RunningServer {
    pub fn spawn(root: &str) -> Result<Self, String> {
        let binary = find_binary()?;
        let port = free_port()?;
        let mut child = Command::new(&binary)
            .args([
                "serve",
                "--hostname",
                "127.0.0.1",
                "--port",
                &port.to_string(),
            ])
            .current_dir(root)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("No se pudo iniciar OpenCode: {error}"))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "OpenCode no abrió stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "OpenCode no abrió stderr".to_string())?;
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
                    "OpenCode no anunció su contraseña de sesión",
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

        let models = client.list_models().map_err(|error| {
            let _ = child.kill();
            let _ = child.wait();
            format!("{error}. Configura un proveedor/modelo en OpenCode.")
        })?;
        if models.is_empty() {
            let _ = child.kill();
            let _ = child.wait();
            return Err(
                "OpenCode no tiene modelos disponibles. Ejecuta `opencode auth login` o configura un proveedor en OpenCode."
                    .to_string(),
            );
        }

        let session = client.create_session("Bradbit").inspect_err(|_| {
            let _ = child.kill();
            let _ = child.wait();
        })?;

        Ok(Self {
            root: root.to_string(),
            session,
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
                    &format!("OpenCode no respondió: {error}"),
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
        .unwrap_or_else(|| "sin salida de diagnóstico".to_string());
    format!("{message}. {details}")
}

fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("No se pudo reservar un puerto local: {error}"))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("No se pudo leer el puerto local: {error}"))
}

pub fn find_binary() -> Result<PathBuf, String> {
    if let Some(configured) = std::env::var_os("BRADBIT_OPENCODE_BIN") {
        let path = PathBuf::from(configured);
        if version_works(&path) {
            return Ok(path);
        }
        return Err(format!(
            "BRADBIT_OPENCODE_BIN no apunta a un OpenCode ejecutable: {}",
            path.display()
        ));
    }

    let mut candidates = vec![PathBuf::from("opencode")];
    if let Some(paths) = std::env::var_os("PATH") {
        for directory in std::env::split_paths(&paths) {
            candidates.push(directory.join("opencode"));
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        candidates.push(home.join(".opencode/bin/opencode"));
        candidates.push(home.join(".local/bin/opencode"));
    }
    candidates.push(PathBuf::from("/opt/homebrew/bin/opencode"));
    candidates.push(PathBuf::from("/usr/local/bin/opencode"));

    for candidate in candidates {
        if version_works(&candidate) {
            return Ok(candidate);
        }
    }
    Err(
        "OpenCode no está instalado o no se encontró su ejecutable. Instálalo desde https://opencode.ai y vuelve a intentar."
            .to_string(),
    )
}

fn version_works(path: &PathBuf) -> bool {
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

    #[test]
    #[ignore = "requiere el binario real de OpenCode y un modelo configurado"]
    fn real_server_starts_creates_a_session_and_stops() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("notas.md"), "# Notas\n").unwrap();
        let root = dir.path().to_str().unwrap();
        let server = RunningServer::spawn(root).expect("start opencode serve");
        assert!(server.session.id.starts_with("ses_"));
        assert_eq!(server.root, root);
        drop(server);
    }
}
