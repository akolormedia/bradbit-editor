//! HTTP client for the OpenCode v2 server.
//!
//! The server binds to localhost and protects every route with HTTP Basic auth
//! (`opencode:<password>`). The password is generated per process and never
//! leaves this module; it is not logged, persisted or sent to the frontend.

use std::fmt;
use std::io::BufReader;
use std::time::Duration;

use serde_json::{json, Value};

use super::event::read_events;
use super::OpenCodeSession;
use crate::git::redact_secrets;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const STREAM_TIMEOUT: Duration = Duration::from_secs(86400);

pub struct OpenCodeClient {
    base_url: String,
    password: String,
    agent: ureq::Agent,
    stream_agent: ureq::Agent,
}

impl fmt::Debug for OpenCodeClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("OpenCodeClient")
            .field("base_url", &self.base_url)
            .field("password", &"<redacted>")
            .finish()
    }
}

impl OpenCodeClient {
    pub fn new(base_url: impl Into<String>, password: impl Into<String>) -> Self {
        let timeout_agent = ureq::Agent::config_builder()
            .timeout_global(Some(REQUEST_TIMEOUT))
            .http_status_as_error(false)
            .build()
            .into();
        let stream_agent = ureq::Agent::config_builder()
            .timeout_global(Some(STREAM_TIMEOUT))
            .http_status_as_error(false)
            .build()
            .into();
        Self {
            base_url: base_url.into(),
            password: password.into(),
            agent: timeout_agent,
            stream_agent,
        }
    }

    pub fn info(&self) -> Result<String, String> {
        let payload = self.get("/api/info")?;
        Ok(payload
            .get("version")
            .and_then(Value::as_str)
            .unwrap_or("desconocida")
            .to_string())
    }

    pub fn list_models(&self) -> Result<Vec<Value>, String> {
        let payload = self.get("/api/model")?;
        payload
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .ok_or_else(|| "OpenCode no devolvió una lista de modelos".to_string())
    }

    pub fn create_session(&self, title: &str) -> Result<OpenCodeSession, String> {
        let payload = self.post("/api/session", &json!({ "title": title }))?;
        let data = payload
            .get("data")
            .ok_or_else(|| "OpenCode no devolvió la sesión creada".to_string())?;
        Ok(OpenCodeSession {
            id: req_str(data, "/id")?,
            title: data
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or(title)
                .to_string(),
        })
    }

    pub fn prompt(&self, session_id: &str, text: &str) -> Result<(), String> {
        validate_session_id(session_id)?;
        if text.trim().is_empty() {
            return Err("El mensaje no puede estar vacío".to_string());
        }
        self.post(
            &format!("/api/session/{session_id}/prompt"),
            &json!({ "text": text }),
        )?;
        Ok(())
    }

    pub fn interrupt(&self, session_id: &str) -> Result<bool, String> {
        validate_session_id(session_id)?;
        let payload = self.post(&format!("/api/session/{session_id}/interrupt"), &json!({}))?;
        Ok(payload
            .get("interrupted")
            .and_then(Value::as_bool)
            .unwrap_or(false))
    }

    /// Subscribe to `/api/event` and call `on_event` for every JSON event.
    /// The call blocks until the stream ends or the child server is killed.
    pub fn subscribe_events<F>(&self, mut on_event: F) -> Result<(), String>
    where
        F: FnMut(Value),
    {
        let url = format!("{}/api/event", self.base_url.trim_end_matches('/'));
        let response = self
            .stream_agent
            .get(&url)
            .header("Authorization", &self.auth_header())
            .header("Accept", "text/event-stream")
            .call()
            .map_err(|error| {
                format!(
                    "No se pudo abrir el stream de OpenCode: {}",
                    redact_secrets(&error.to_string())
                )
            })?;
        let status = response.status().as_u16();
        if !(200..300).contains(&status) {
            return Err(format!("OpenCode rechazó el stream (HTTP {status})"));
        }
        let (_, body) = response.into_parts();
        read_events(BufReader::new(body.into_reader()), &mut on_event)
    }

    fn get(&self, path: &str) -> Result<Value, String> {
        let url = format!("{}{path}", self.base_url.trim_end_matches('/'));
        let response = self
            .agent
            .get(&url)
            .header("Authorization", &self.auth_header())
            .call()
            .map_err(|error| self.transport_error(error))?;
        self.decode_response(response)
    }

    fn post(&self, path: &str, body: &Value) -> Result<Value, String> {
        let url = format!("{}{path}", self.base_url.trim_end_matches('/'));
        let response = self
            .agent
            .post(&url)
            .header("Authorization", &self.auth_header())
            .header("Content-Type", "application/json")
            .send_json(body)
            .map_err(|error| self.transport_error(error))?;
        self.decode_response(response)
    }

    fn decode_response(
        &self,
        mut response: ureq::http::Response<ureq::Body>,
    ) -> Result<Value, String> {
        let status = response.status().as_u16();
        let body = response
            .body_mut()
            .read_to_string()
            .map_err(|error| format!("No se pudo leer la respuesta de OpenCode: {error}"))?;
        if !(200..300).contains(&status) {
            return Err(api_error(status, &body));
        }
        if body.trim().is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(&body)
            .map_err(|error| format!("OpenCode devolvió JSON inválido: {error}"))
    }

    fn transport_error(&self, error: ureq::Error) -> String {
        format!(
            "No se pudo conectar con OpenCode: {}",
            redact_secrets(&error.to_string())
        )
    }

    fn auth_header(&self) -> String {
        format!(
            "Basic {}",
            base64_encode(format!("opencode:{}", self.password).as_bytes())
        )
    }
}

fn api_error(status: u16, body: &str) -> String {
    let message = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|payload| {
            payload
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| {
                    payload
                        .get("_tag")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
        })
        .unwrap_or_else(|| "sin detalles".to_string());
    format!(
        "OpenCode respondió HTTP {status}: {}",
        redact_secrets(&message)
    )
}

fn req_str(payload: &Value, pointer: &str) -> Result<String, String> {
    payload
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| format!("OpenCode no devolvió el campo requerido {pointer}"))
}

fn validate_session_id(session_id: &str) -> Result<(), String> {
    if session_id.starts_with("ses_")
        && session_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        })
    {
        Ok(())
    } else {
        Err("ID de sesión de OpenCode inválido".to_string())
    }
}

/// Standard base64 encoding. Kept local to avoid pulling another dependency
/// just for the Basic auth header.
pub(crate) fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_the_standard_alphabet() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"opencode:secret"), "b3BlbmNvZGU6c2VjcmV0");
    }

    #[test]
    fn debug_never_shows_the_server_password() {
        let client = OpenCodeClient::new("http://127.0.0.1:1", "test-password");
        let printed = format!("{client:?}");
        assert!(!printed.contains("test-password"), "{printed}");
        assert!(printed.contains("<redacted>"), "{printed}");
    }

    #[test]
    fn rejects_path_injection_in_session_ids() {
        assert!(validate_session_id("ses_abc123").is_ok());
        assert!(validate_session_id("../session").is_err());
        assert!(validate_session_id("ses_a/b").is_err());
        assert!(validate_session_id("").is_err());
    }

    #[test]
    fn api_errors_include_the_provider_message_without_secrets() {
        let error = api_error(401, r#"{"message":"Bad credentials ghp_secretvalue"}"#);
        assert!(error.contains("Bad credentials"), "{error}");
        assert!(!error.contains("ghp_secretvalue"), "{error}");
    }
}
