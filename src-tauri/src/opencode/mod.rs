//! Agent runtime session bridge for the native chat panel.
//!
//! The bundled `bradbit` sidecar (or a compatible `opencode` fallback) runs one
//! `serve` process per open project. Commands talk to it through the local HTTP
//! API; events are forwarded to the frontend through [`server::EVENT_NAME`].
//! The public `OpenCode*` names are kept for protocol compatibility.

pub mod chat;
pub mod client;
pub mod event;
pub mod server;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::AppHandle;

pub use chat::{OpenCodeChatMessage, OpenCodeForm, OpenCodePermission};
pub use server::{find_binary, RunningServer, EVENT_NAME};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeSession {
    pub id: String,
    pub title: String,
    pub updated: Option<i64>,
    pub directory: Option<String>,
    pub agent: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeModel {
    pub id: String,
    pub name: String,
    pub provider_id: String,
    pub variants: Vec<String>,
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
    pub fn start(&self, app: &AppHandle, root: &str) -> Result<(), String> {
        let _start_guard = self
            .start_lock
            .lock()
            .map_err(|_| "Could not lock OpenCode startup".to_string())?;
        let mut server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;

        if let Some(existing) = server.as_ref() {
            if existing.root == root {
                return Ok(());
            }
            *server = None;
        }

        let running = RunningServer::spawn(root)?;
        running.start_event_stream(app.clone());
        *server = Some(running);
        Ok(())
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
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        server.client().prompt(session_id, text)
    }

    pub fn abort(&self, session_id: &str) -> Result<bool, String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        server.client().interrupt(session_id)
    }

    pub fn list_sessions(&self) -> Result<Vec<OpenCodeSession>, String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        let root = server.root.clone();
        let sessions = server.client().list_sessions()?;
        Ok(sessions
            .into_iter()
            .filter(|session| {
                session
                    .directory
                    .as_deref()
                    .map(|directory| same_directory(directory, &root))
                    .unwrap_or(true)
            })
            .collect())
    }

    pub fn create_session(&self, title: &str) -> Result<OpenCodeSession, String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        server.client().create_session(title)
    }

    pub fn update_session_title(&self, session_id: &str, title: &str) -> Result<(), String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        server.client().update_session_title(session_id, title)
    }

    pub fn session_messages(&self, session_id: &str) -> Result<Vec<OpenCodeChatMessage>, String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        server.client().session_messages(session_id)
    }

    pub fn pending_permissions(&self, session_id: &str) -> Result<Vec<OpenCodePermission>, String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        server.client().pending_permissions(session_id)
    }

    pub fn reply_permission(
        &self,
        session_id: &str,
        request_id: &str,
        decision: &str,
    ) -> Result<(), String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        server
            .client()
            .reply_permission(session_id, request_id, decision)
    }

    pub fn pending_forms(&self, session_id: &str) -> Result<Vec<OpenCodeForm>, String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        server.client().pending_forms(session_id)
    }

    pub fn reply_form(
        &self,
        session_id: &str,
        form_id: &str,
        answer: &serde_json::Value,
    ) -> Result<(), String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        server.client().reply_form(session_id, form_id, answer)
    }

    pub fn models(&self) -> Result<Vec<OpenCodeModel>, String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        server.client().model_catalog()
    }

    pub fn switch_agent(&self, session_id: &str, agent: &str) -> Result<(), String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        server.client().switch_agent(session_id, agent)
    }

    pub fn switch_model(
        &self,
        session_id: &str,
        provider_id: &str,
        model_id: &str,
        variant: Option<&str>,
    ) -> Result<(), String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        server
            .client()
            .switch_model(session_id, provider_id, model_id, variant)
    }

    pub fn run_command(&self, session_id: &str, name: &str, text: &str) -> Result<(), String> {
        let server = self
            .server
            .lock()
            .map_err(|_| "Could not lock the OpenCode state".to_string())?;
        let server = server
            .as_ref()
            .ok_or_else(|| "The Bradbit agent runtime is not running".to_string())?;
        server.client().run_command(session_id, name, text)
    }

    pub fn status(&self) -> OpenCodeStatus {
        let running = self
            .server
            .lock()
            .ok()
            .and_then(|server| server.as_ref().map(|server| server.root.clone()));
        OpenCodeStatus {
            binary_found: find_binary().is_ok(),
            running: running.is_some(),
            session_id: None,
            root: running,
        }
    }
}

fn canonical(path: &str) -> PathBuf {
    fs::canonicalize(Path::new(path)).unwrap_or_else(|_| PathBuf::from(path))
}

fn same_directory(a: &str, b: &str) -> bool {
    canonical(a) == canonical(b)
}
