//! OpenCode session bridge for the native chat panel.
//!
//! One `opencode serve` process runs per open project. Commands talk to it
//! through the local HTTP API; events are forwarded to the frontend through
//! [`server::EVENT_NAME`].

pub mod client;
pub mod event;
pub mod server;

use std::sync::Mutex;

use serde::Serialize;
use tauri::AppHandle;

pub use server::{find_binary, RunningServer, EVENT_NAME};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeSession {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeStatus {
    pub binary_found: bool,
    pub running: bool,
    pub session_id: Option<String>,
    pub root: Option<String>,
}

#[derive(Default)]
pub struct OpenCodeState {
    server: Mutex<Option<RunningServer>>,
    start_lock: Mutex<()>,
}

impl OpenCodeState {
    pub fn start(&self, app: &AppHandle, root: &str) -> Result<OpenCodeSession, String> {
        let _start_guard = self
            .start_lock
            .lock()
            .map_err(|_| "No se pudo bloquear el inicio de OpenCode".to_string())?;
        let mut server = self
            .server
            .lock()
            .map_err(|_| "No se pudo bloquear el estado de OpenCode".to_string())?;

        if let Some(existing) = server.as_ref() {
            if existing.root == root {
                return Ok(existing.session.clone());
            }
            *server = None;
        }

        let running = RunningServer::spawn(root)?;
        running.start_event_stream(app.clone());
        let session = running.session.clone();
        *server = Some(running);
        Ok(session)
    }

    pub fn stop(&self) {
        if let Ok(mut server) = self.server.lock() {
            *server = None;
        }
    }

    pub fn send(&self, session_id: &str, text: &str) -> Result<(), String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "No se pudo bloquear el estado de OpenCode".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "OpenCode no está iniciado".to_string())?;
        server.client().prompt(session_id, text)
    }

    pub fn abort(&self, session_id: &str) -> Result<bool, String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "No se pudo bloquear el estado de OpenCode".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "OpenCode no está iniciado".to_string())?;
        server.client().interrupt(session_id)
    }

    pub fn status(&self) -> OpenCodeStatus {
        let running = self.server.lock().ok().and_then(|server| {
            server
                .as_ref()
                .map(|server| (server.session.id.clone(), server.root.clone()))
        });
        OpenCodeStatus {
            binary_found: find_binary().is_ok(),
            running: running.is_some(),
            session_id: running.as_ref().map(|(id, _)| id.clone()),
            root: running.map(|(_, root)| root),
        }
    }
}
