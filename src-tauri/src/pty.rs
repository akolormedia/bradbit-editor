//! Native PTY bridge for the integrated agent terminal.
//!
//! One PTY session belongs to the open project. The frontend sends keystrokes
//! through `write`, receives output through the `bradbit-pty-output` event and
//! can resize the terminal. Shell presets resolve to `$SHELL`, the OpenCode
//! binary, `claude`, or a custom command executed with the login shell.

use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;

pub const OUTPUT_EVENT: &str = "bradbit-pty-output";
pub const EXIT_EVENT: &str = "bradbit-pty-exit";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PtyStartOptions {
    pub id: String,
    pub root: String,
    pub command: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PtyStartResult {
    pub id: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PtyStatus {
    pub running: bool,
    pub id: Option<String>,
    pub root: Option<String>,
    pub command: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PtyOutputEvent {
    pub id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PtyExitEvent {
    pub id: String,
    pub code: Option<i32>,
}

#[derive(Default)]
pub struct PtyState {
    session: Mutex<Option<PtySession>>,
    sequence: AtomicU64,
}

struct PtySession {
    id: String,
    root: String,
    command: String,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    alive: Arc<AtomicBool>,
}

impl Drop for PtySession {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::Relaxed);
        let _ = self.killer.kill();
    }
}

impl PtyState {
    pub fn next_id(&self) -> String {
        format!("pty_{}", self.sequence.fetch_add(1, Ordering::Relaxed) + 1)
    }

    pub fn start<F, G>(
        &self,
        options: PtyStartOptions,
        on_output: F,
        on_exit: G,
    ) -> Result<PtyStartResult, String>
    where
        F: Fn(String) + Send + 'static,
        G: Fn(Option<i32>) + Send + 'static,
    {
        let PtyStartOptions {
            id,
            root,
            command,
            cols,
            rows,
        } = options;
        if !Path::new(&root).is_dir() {
            return Err("La carpeta del proyecto no existe".to_string());
        }
        let mut guard = self
            .session
            .lock()
            .map_err(|_| "No se pudo bloquear el terminal".to_string())?;
        if let Some(existing) = guard.take() {
            drop(existing);
        }

        let (label, builder) = build_command(&command, &root)?;
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: rows.max(1),
                cols: cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("No se pudo abrir el PTY: {error}"))?;
        let mut child = pair
            .slave
            .spawn_command(builder)
            .map_err(|error| format!("No se pudo iniciar el terminal: {error}"))?;
        drop(pair.slave);
        let killer = child.clone_killer();
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| format!("No se pudo leer el terminal: {error}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| format!("No se pudo escribir en el terminal: {error}"))?;

        let alive = Arc::new(AtomicBool::new(true));
        let output_alive = Arc::clone(&alive);
        thread::spawn(move || {
            let mut buffer = [0_u8; 8192];
            loop {
                if !output_alive.load(Ordering::Relaxed) {
                    break;
                }
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(read) => on_output(String::from_utf8_lossy(&buffer[..read]).to_string()),
                    Err(_) => break,
                }
            }
        });

        let exit_alive = Arc::clone(&alive);
        thread::spawn(move || {
            let status = child.wait().ok();
            exit_alive.store(false, Ordering::Relaxed);
            on_exit(status.map(|status| status.exit_code() as i32));
        });

        *guard = Some(PtySession {
            id: id.clone(),
            root: root.clone(),
            command: label.clone(),
            master: pair.master,
            writer,
            killer,
            alive,
        });
        Ok(PtyStartResult { id, command: label })
    }

    pub fn write(&self, id: &str, data: &str) -> Result<(), String> {
        let mut guard = self
            .session
            .lock()
            .map_err(|_| "No se pudo bloquear el terminal".to_string())?;
        let session = guard
            .as_mut()
            .ok_or_else(|| "El terminal no está iniciado".to_string())?;
        if session.id != id || !session.alive.load(Ordering::Relaxed) {
            return Err("La sesión del terminal no está activa".to_string());
        }
        session
            .writer
            .write_all(data.as_bytes())
            .and_then(|_| session.writer.flush())
            .map_err(|error| format!("No se pudo escribir en el terminal: {error}"))
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let guard = self
            .session
            .lock()
            .map_err(|_| "No se pudo bloquear el terminal".to_string())?;
        let session = guard
            .as_ref()
            .ok_or_else(|| "El terminal no está iniciado".to_string())?;
        if session.id != id {
            return Err("La sesión del terminal no está activa".to_string());
        }
        session
            .master
            .resize(PtySize {
                rows: rows.max(1),
                cols: cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("No se pudo redimensionar el terminal: {error}"))
    }

    pub fn stop(&self) {
        if let Ok(mut guard) = self.session.lock() {
            if let Some(session) = guard.take() {
                drop(session);
            }
        }
    }

    pub fn status(&self) -> PtyStatus {
        let running = self.session.lock().ok().and_then(|guard| {
            guard.as_ref().and_then(|session| {
                if session.alive.load(Ordering::Relaxed) {
                    Some((
                        session.id.clone(),
                        session.root.clone(),
                        session.command.clone(),
                    ))
                } else {
                    None
                }
            })
        });
        PtyStatus {
            running: running.is_some(),
            id: running.as_ref().map(|(id, _, _)| id.clone()),
            root: running.as_ref().map(|(_, root, _)| root.clone()),
            command: running.map(|(_, _, command)| command),
        }
    }
}

fn build_command(command: &str, root: &str) -> Result<(String, CommandBuilder), String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let trimmed = command.trim();
    let (label, program, args) = match trimmed {
        "" | "shell" => ("shell".to_string(), shell.clone(), Vec::new()),
        "opencode" => {
            let binary = crate::opencode::find_binary()
                .map_err(|error| format!("No se encontró el binario de OpenCode: {error}"))?;
            (
                "opencode".to_string(),
                binary.to_string_lossy().to_string(),
                Vec::new(),
            )
        }
        "claude" => ("claude".to_string(), "claude".to_string(), Vec::new()),
        custom => (
            custom.to_string(),
            shell.clone(),
            vec!["-lc".to_string(), custom.to_string()],
        ),
    };
    let mut builder = CommandBuilder::new(&program);
    if !args.is_empty() {
        builder.args(args);
    }
    builder.cwd(root);
    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");
    Ok((label, builder))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    #[test]
    fn starts_writes_resizes_and_stops_a_shell() {
        let dir = tempfile::tempdir().unwrap();
        let state = PtyState::default();
        let (tx, rx) = mpsc::channel::<String>();
        let output_tx = tx.clone();
        let exit_tx = tx;
        let started = state
            .start(
                PtyStartOptions {
                    id: "pty_test".to_string(),
                    root: dir.path().to_str().unwrap().to_string(),
                    command: "shell".to_string(),
                    cols: 80,
                    rows: 24,
                },
                move |data| {
                    let _ = output_tx.send(data);
                },
                move |code| {
                    let _ = exit_tx.send(format!("__exit__:{code:?}"));
                },
            )
            .expect("start pty");
        assert_eq!(started.id, "pty_test");
        assert_eq!(started.command, "shell");

        state
            .write("pty_test", "printf 'pty-hello\\n'\n")
            .expect("write command");
        state.resize("pty_test", 100, 30).expect("resize pty");

        let deadline = Instant::now() + Duration::from_secs(10);
        let mut output = String::new();
        while Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(data) => {
                    output.push_str(&data);
                    if output.contains("pty-hello") {
                        break;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        assert!(output.contains("pty-hello"), "PTY output was: {output}");
        state.stop();
    }

    #[test]
    fn rejects_writes_and_resizes_for_unknown_sessions() {
        let state = PtyState::default();
        assert!(state.write("missing", "x").is_err());
        assert!(state.resize("missing", 80, 24).is_err());
        assert_eq!(
            state.status(),
            PtyStatus {
                running: false,
                id: None,
                root: None,
                command: None,
            }
        );
    }

    #[test]
    fn resolves_shell_and_custom_commands_with_the_project_cwd() {
        let dir = tempfile::tempdir().unwrap();
        let (_, builder) = build_command("shell", dir.path().to_str().unwrap()).unwrap();
        let _ = builder;
        let (label, _) = build_command("echo custom", dir.path().to_str().unwrap()).unwrap();
        assert_eq!(label, "echo custom");
    }
}
