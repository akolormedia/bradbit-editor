//! HTTP client for the OpenCode v2 server.
//!
//! The server binds to localhost and protects every route with HTTP Basic auth
//! (`opencode:<password>`). The password is generated per process and never
//! leaves this module; it is not logged, persisted or sent to the frontend.

use std::fmt;
use std::io::BufReader;
use std::time::Duration;

use serde_json::{json, Value};

use super::chat::{parse_chat_message, parse_form, parse_permission};
use super::event::read_events;
use super::{
    OpenCodeChatMessage, OpenCodeForm, OpenCodeModel, OpenCodePermission, OpenCodeSession,
};
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
            .unwrap_or("unknown")
            .to_string())
    }

    pub fn list_models(&self) -> Result<Vec<Value>, String> {
        let payload = self.get("/api/model")?;
        payload
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .ok_or_else(|| "OpenCode did not return a model list".to_string())
    }

    pub fn list_sessions(&self) -> Result<Vec<OpenCodeSession>, String> {
        let payload = self.get("/api/session")?;
        let data = payload
            .get("data")
            .and_then(Value::as_array)
            .ok_or_else(|| "OpenCode did not return a session list".to_string())?;
        Ok(data.iter().filter_map(parse_session).collect())
    }

    pub fn create_session(&self, title: &str) -> Result<OpenCodeSession, String> {
        let payload = self.post("/api/session", &json!({ "title": title }))?;
        let data = payload
            .get("data")
            .ok_or_else(|| "OpenCode did not return the created session".to_string())?;
        parse_session(data).ok_or_else(|| "OpenCode returned an invalid session".to_string())
    }

    pub fn update_session_title(&self, session_id: &str, title: &str) -> Result<(), String> {
        validate_session_id(session_id)?;
        // OpenCode replies 204 No Content for this endpoint, so there is no
        // session payload to parse.
        self.patch(
            &format!("/api/session/{session_id}"),
            &json!({ "title": title }),
        )?;
        Ok(())
    }

    pub fn session_messages(&self, session_id: &str) -> Result<Vec<OpenCodeChatMessage>, String> {
        validate_session_id(session_id)?;
        let payload = self.get(&format!(
            "/api/session/{session_id}/message?limit=200&order=asc"
        ))?;
        let data = payload
            .get("data")
            .and_then(Value::as_array)
            .ok_or_else(|| "OpenCode did not return the session messages".to_string())?;
        Ok(data.iter().filter_map(parse_chat_message).collect())
    }

    pub fn pending_permissions(&self, session_id: &str) -> Result<Vec<OpenCodePermission>, String> {
        validate_session_id(session_id)?;
        let payload = self.get(&format!("/api/session/{session_id}/permission"))?;
        let data = payload
            .get("data")
            .and_then(Value::as_array)
            .ok_or_else(|| "OpenCode did not return pending permissions".to_string())?;
        Ok(data.iter().filter_map(parse_permission).collect())
    }

    pub fn reply_permission(
        &self,
        session_id: &str,
        request_id: &str,
        decision: &str,
    ) -> Result<(), String> {
        validate_session_id(session_id)?;
        if !matches!(decision, "once" | "always" | "reject") {
            return Err("Invalid permission decision".to_string());
        }
        if !request_id.starts_with("per_")
            || !request_id
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
        {
            return Err("Invalid permission ID".to_string());
        }
        self.post(
            &format!("/api/session/{session_id}/permission/{request_id}/reply"),
            &json!({ "decision": decision }),
        )?;
        Ok(())
    }

    pub fn pending_forms(&self, session_id: &str) -> Result<Vec<OpenCodeForm>, String> {
        validate_session_id(session_id)?;
        let payload = self.get(&format!("/api/session/{session_id}/form"))?;
        let data = payload
            .get("data")
            .and_then(Value::as_array)
            .ok_or_else(|| "OpenCode did not return pending forms".to_string())?;
        Ok(data.iter().filter_map(parse_form).collect())
    }

    pub fn model_catalog(&self) -> Result<Vec<OpenCodeModel>, String> {
        let payload = self.get("/api/model")?;
        let data = payload
            .get("data")
            .and_then(Value::as_array)
            .ok_or_else(|| "OpenCode did not return a model list".to_string())?;
        let mut models = std::collections::BTreeMap::new();
        for item in data {
            let kind = item.get("type").and_then(Value::as_str).unwrap_or("chat");
            if kind != "chat" || item.get("enabled").and_then(Value::as_bool) == Some(false) {
                continue;
            }
            let Some(id) = item
                .get("modelID")
                .and_then(Value::as_str)
                .or_else(|| item.get("id").and_then(Value::as_str))
            else {
                continue;
            };
            let Some(provider_id) = item.get("providerID").and_then(Value::as_str) else {
                continue;
            };
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(id)
                .to_string();
            let variants = item
                .get("variants")
                .and_then(Value::as_array)
                .map(|variants| {
                    variants
                        .iter()
                        .filter_map(|variant| variant.get("id").and_then(Value::as_str))
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            models.insert(
                (provider_id.to_string(), id.to_string()),
                OpenCodeModel {
                    id: id.to_string(),
                    name,
                    provider_id: provider_id.to_string(),
                    variants,
                },
            );
        }
        Ok(models.into_values().collect())
    }

    pub fn switch_agent(&self, session_id: &str, agent: &str) -> Result<(), String> {
        validate_session_id(session_id)?;
        validate_agent_id(agent)?;
        self.post(
            &format!("/api/session/{session_id}/agent"),
            &json!({ "agent": agent }),
        )?;
        Ok(())
    }

    pub fn switch_model(
        &self,
        session_id: &str,
        provider_id: &str,
        model_id: &str,
        variant: Option<&str>,
    ) -> Result<(), String> {
        validate_session_id(session_id)?;
        validate_model_part(provider_id)?;
        validate_model_part(model_id)?;
        if let Some(variant) = variant {
            validate_model_part(variant)?;
        }
        let mut model = json!({ "id": model_id, "providerID": provider_id });
        if let Some(variant) = variant {
            model["variant"] = json!(variant);
        }
        self.post(
            &format!("/api/session/{session_id}/model"),
            &json!({ "model": model }),
        )?;
        Ok(())
    }

    pub fn run_command(&self, session_id: &str, name: &str, text: &str) -> Result<(), String> {
        validate_session_id(session_id)?;
        validate_command_name(name)?;
        if text.len() > 200_000 {
            return Err("El texto del comando es demasiado largo".to_string());
        }
        self.post(
            &format!("/api/session/{session_id}/command"),
            &json!({ "name": name, "text": text }),
        )?;
        Ok(())
    }

    pub fn reply_form(
        &self,
        session_id: &str,
        form_id: &str,
        answer: &Value,
    ) -> Result<(), String> {
        validate_session_id(session_id)?;
        if !form_id.starts_with("frm_")
            || !form_id
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
        {
            return Err("Invalid form ID".to_string());
        }
        if !answer.is_object() {
            return Err("La respuesta del formulario debe ser un objeto".to_string());
        }
        self.post(
            &format!("/api/session/{session_id}/form/{form_id}/reply"),
            &json!({ "answer": answer }),
        )?;
        Ok(())
    }

    pub fn prompt(&self, session_id: &str, text: &str) -> Result<(), String> {
        validate_session_id(session_id)?;
        if text.trim().is_empty() {
            return Err("The message cannot be empty".to_string());
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
                    "Could not open the OpenCode stream: {}",
                    redact_secrets(&error.to_string())
                )
            })?;
        let status = response.status().as_u16();
        if !(200..300).contains(&status) {
            return Err(format!("OpenCode rejected the stream (HTTP {status})"));
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

    fn patch(&self, path: &str, body: &Value) -> Result<Value, String> {
        let url = format!("{}{path}", self.base_url.trim_end_matches('/'));
        let response = self
            .agent
            .patch(&url)
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
            .map_err(|error| format!("Could not read the OpenCode response: {error}"))?;
        if !(200..300).contains(&status) {
            return Err(api_error(status, &body));
        }
        if body.trim().is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(&body)
            .map_err(|error| format!("OpenCode returned invalid JSON: {error}"))
    }

    fn transport_error(&self, error: ureq::Error) -> String {
        format!(
            "Could not connect to OpenCode: {}",
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
        "OpenCode responded HTTP {status}: {}",
        redact_secrets(&message)
    )
}

fn parse_model_ref(value: &Value) -> Option<String> {
    let provider = value.get("providerID").and_then(Value::as_str)?;
    let id = value.get("id").and_then(Value::as_str)?;
    let variant = value
        .get("variant")
        .and_then(Value::as_str)
        .filter(|variant| !variant.is_empty());
    Some(match variant {
        Some(variant) => format!("{provider}/{id}#{variant}"),
        None => format!("{provider}/{id}"),
    })
}

fn parse_session(value: &Value) -> Option<OpenCodeSession> {
    let id = value.get("id").and_then(Value::as_str)?;
    if !id.starts_with("ses_") {
        return None;
    }
    Some(OpenCodeSession {
        id: id.to_string(),
        title: value
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Session")
            .to_string(),
        updated: value.pointer("/time/updated").and_then(Value::as_i64),
        directory: value
            .pointer("/location/directory")
            .and_then(Value::as_str)
            .map(str::to_string),
        agent: value
            .get("agent")
            .and_then(Value::as_str)
            .map(str::to_string),
        model: value.get("model").and_then(parse_model_ref),
    })
}

fn validate_agent_id(agent: &str) -> Result<(), String> {
    if !agent.is_empty()
        && agent
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_.".contains(character))
    {
        Ok(())
    } else {
        Err("Invalid OpenCode agent ID".to_string())
    }
}

fn validate_model_part(value: &str) -> Result<(), String> {
    if !value.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_.:/".contains(character))
    {
        Ok(())
    } else {
        Err("Invalid model ID".to_string())
    }
}

fn validate_command_name(name: &str) -> Result<(), String> {
    if !name.is_empty()
        && name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_.".contains(character))
    {
        Ok(())
    } else {
        Err("Invalid command name".to_string())
    }
}

fn validate_session_id(session_id: &str) -> Result<(), String> {
    if session_id.starts_with("ses_")
        && session_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        })
    {
        Ok(())
    } else {
        Err("Invalid OpenCode session ID".to_string())
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

    #[test]
    fn parses_sessions_and_chat_history() {
        let session = parse_session(&json!({
            "id": "ses_abc",
            "title": "Sesión 1",
            "time": { "created": 1, "updated": 42 },
            "location": { "directory": "/proyecto" },
            "agent": "guionista",
            "model": { "id": "hy4", "providerID": "opencode-go", "variant": "high" }
        }))
        .expect("session");
        assert_eq!(session.id, "ses_abc");
        assert_eq!(session.updated, Some(42));
        assert_eq!(session.directory.as_deref(), Some("/proyecto"));
        assert_eq!(session.agent.as_deref(), Some("guionista"));
        assert_eq!(session.model.as_deref(), Some("opencode-go/hy4#high"));

        let user = parse_chat_message(&json!({
            "id": "msg_user",
            "type": "user",
            "text": "Hola"
        }))
        .expect("user message");
        assert_eq!(user.role, "user");
        assert_eq!(user.text, "Hola");

        let assistant = parse_chat_message(&json!({
            "id": "msg_assistant",
            "type": "assistant",
            "content": [
                { "type": "reasoning", "text": "pensando" },
                { "type": "text", "text": "Hola" },
                { "type": "tool", "name": "read" },
                { "type": "text", "text": "mundo" }
            ]
        }))
        .expect("assistant message");
        assert_eq!(assistant.role, "assistant");
        assert_eq!(assistant.text, "Hola\nmundo");

        assert!(parse_chat_message(&json!({
            "id": "msg_tool",
            "type": "assistant",
            "content": [{ "type": "tool", "name": "read" }]
        }))
        .is_none());
    }
}
