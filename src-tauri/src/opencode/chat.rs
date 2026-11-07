//! Chat history and event normalization for the session UI.
//!
//! OpenCode exposes rich assistant parts (text and tool calls) in history and
//! granular tool/permission events while a response streams. This module turns
//! both into a stable, camelCase shape consumed by the frontend, and derives
//! the files a tool touched so they can be opened in the editor.

use serde::Serialize;
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeTokens {
    pub input: u64,
    pub output: u64,
    pub reasoning: u64,
    pub cache_read: u64,
    pub cache_write: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeToolCall {
    pub id: String,
    pub name: String,
    pub status: String,
    pub input: Value,
    pub output: String,
    pub error: String,
    pub executed: bool,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum OpenCodeMessagePart {
    Text { text: String },
    Tool { tool: OpenCodeToolCall },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeChatMessage {
    pub id: String,
    pub role: String,
    pub text: String,
    pub parts: Vec<OpenCodeMessagePart>,
    pub tokens: Option<OpenCodeTokens>,
    pub model: Option<String>,
    pub agent: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodePermission {
    pub id: String,
    pub session_id: String,
    pub action: String,
    pub resources: Vec<String>,
    pub save: Vec<String>,
    pub message: String,
    pub tool_id: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodePermissionReply {
    pub request_id: String,
    pub session_id: String,
    pub reply: String,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeForm {
    pub id: String,
    pub session_id: String,
    pub title: String,
    pub kind: String,
    pub tool_id: Option<String>,
    pub message_id: Option<String>,
    pub fields: Value,
    pub status: String,
    pub answer: Option<Value>,
    pub message: Option<String>,
}

/// Parse one `/api/session/{id}/message` entry into text parts, tool calls and
/// usage metadata. Assistant messages with no visible content are dropped.
pub fn parse_chat_message(value: &Value) -> Option<OpenCodeChatMessage> {
    let id = value.get("id").and_then(Value::as_str)?.to_string();
    let kind = value.get("type").and_then(Value::as_str)?;

    if kind == "user" {
        let text = value
            .get("text")
            .and_then(Value::as_str)?
            .trim()
            .to_string();
        if text.is_empty() {
            return None;
        }
        return Some(OpenCodeChatMessage {
            id,
            role: "user".to_string(),
            text: text.clone(),
            parts: vec![OpenCodeMessagePart::Text { text }],
            tokens: None,
            model: None,
            agent: None,
        });
    }

    if kind != "assistant" {
        return None;
    }

    let content = value.get("content").and_then(Value::as_array)?;
    let mut parts = Vec::new();
    let mut texts = Vec::new();
    for part in content {
        match part.get("type").and_then(Value::as_str) {
            Some("text") => {
                if let Some(text) = part.get("text").and_then(Value::as_str) {
                    if !text.trim().is_empty() {
                        texts.push(text.to_string());
                        parts.push(OpenCodeMessagePart::Text {
                            text: text.to_string(),
                        });
                    }
                }
            }
            Some("tool") => {
                if let Some(tool) = parse_tool(part) {
                    parts.push(OpenCodeMessagePart::Tool { tool });
                }
            }
            _ => {}
        }
    }
    if parts.is_empty() {
        return None;
    }

    Some(OpenCodeChatMessage {
        id,
        role: "assistant".to_string(),
        text: texts.join("\n"),
        parts,
        tokens: value.get("tokens").and_then(parse_tokens),
        model: parse_model(value.get("model")),
        agent: value
            .get("agent")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

/// Parse a pending permission request returned by the session permission list.
pub fn parse_permission(value: &Value) -> Option<OpenCodePermission> {
    let id = value.get("id").and_then(Value::as_str)?.to_string();
    let session_id = value.get("sessionID").and_then(Value::as_str)?.to_string();
    let action = value.get("action").and_then(Value::as_str)?.to_string();
    let resources = string_array(value.get("resources"));
    let save = string_array(value.get("save"));
    let message = value
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let tool_id = value
        .pointer("/source/id")
        .and_then(Value::as_str)
        .map(str::to_string);
    Some(OpenCodePermission {
        id,
        session_id,
        action,
        resources,
        save,
        message,
        tool_id,
        status: "pending".to_string(),
    })
}

/// Parse a pending form returned by the session form list or a `form.created`
/// event. Fields are passed through as JSON because OpenCode supports several
/// field types (string, number, boolean, multiselect and external).
pub fn parse_form(value: &Value) -> Option<OpenCodeForm> {
    let id = value.get("id").and_then(Value::as_str)?.to_string();
    let session_id = value.get("sessionID").and_then(Value::as_str)?.to_string();
    let title = value
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Pregunta")
        .to_string();
    let kind = value
        .pointer("/metadata/kind")
        .and_then(Value::as_str)
        .unwrap_or("question")
        .to_string();
    let tool_id = value
        .pointer("/metadata/tool/id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let message_id = value
        .pointer("/metadata/tool/messageID")
        .and_then(Value::as_str)
        .map(str::to_string);
    let fields = value
        .get("fields")
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));
    let status = value
        .pointer("/state/status")
        .and_then(Value::as_str)
        .unwrap_or("pending")
        .to_string();
    let answer = value.pointer("/state/answer").cloned();
    let message = value
        .pointer("/state/message")
        .and_then(Value::as_str)
        .map(str::to_string);
    Some(OpenCodeForm {
        id,
        session_id,
        title,
        kind,
        tool_id,
        message_id,
        fields,
        status,
        answer,
        message,
    })
}

/// Add a normalized `tool`, `permission` or `permissionReply` object to the
/// raw SSE event without changing its type or routing fields.
pub fn normalize_event(mut event: Value) -> Value {
    let event_type = event
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let data = event.get("data").cloned().unwrap_or_else(|| json!({}));
    let normalized = match event_type.as_str() {
        "session.tool.input.started" => tool_event(&data, "streaming", None),
        "session.tool.input.ended" => {
            tool_event(&data, "streaming", Some(parsed_input(data.get("text"))))
        }
        "session.tool.called" => tool_event(&data, "running", data.get("input").cloned()),
        "session.tool.success" => {
            tool_event(&data, "completed", Some(normalized_tool_output(&data)))
        }
        "session.tool.failed" => tool_event(&data, "error", Some(normalized_tool_output(&data))),
        _ => None,
    };
    if let Some(tool) = normalized {
        insert_data(
            &mut event,
            "tool",
            serde_json::to_value(tool).unwrap_or(Value::Null),
        );
    }

    match event_type.as_str() {
        "permission.asked" => {
            if let Some(permission) = parse_permission(&data) {
                insert_data(
                    &mut event,
                    "permission",
                    serde_json::to_value(permission).unwrap_or(Value::Null),
                );
            }
        }
        "permission.replied" => {
            let reply = data
                .get("reply")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let reply = OpenCodePermissionReply {
                request_id: data
                    .get("requestID")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                session_id: data
                    .get("sessionID")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                status: if reply == "reject" {
                    "rejected".to_string()
                } else {
                    "allowed".to_string()
                },
                reply,
            };
            insert_data(
                &mut event,
                "permissionReply",
                serde_json::to_value(reply).unwrap_or(Value::Null),
            );
        }
        "form.created" => {
            if let Some(form) = parse_form(data.get("form").unwrap_or(&Value::Null)) {
                insert_data(
                    &mut event,
                    "form",
                    serde_json::to_value(form).unwrap_or(Value::Null),
                );
            }
        }
        "form.replied" => {
            insert_data(
                &mut event,
                "formReply",
                json!({
                    "id": data.get("id").and_then(Value::as_str).unwrap_or_default(),
                    "sessionId": data.get("sessionID").and_then(Value::as_str).unwrap_or_default(),
                    "status": "answered",
                    "answer": data.get("answer").cloned().unwrap_or(Value::Null),
                }),
            );
        }
        "form.cancelled" => {
            insert_data(
                &mut event,
                "formReply",
                json!({
                    "id": data.get("id").and_then(Value::as_str).unwrap_or_default(),
                    "sessionId": data.get("sessionID").and_then(Value::as_str).unwrap_or_default(),
                    "status": "cancelled",
                }),
            );
        }
        _ => {}
    }

    event
}

fn parse_tool(value: &Value) -> Option<OpenCodeToolCall> {
    let id = value.get("id").and_then(Value::as_str)?.to_string();
    let name = value.get("name").and_then(Value::as_str)?.to_string();
    let state = value.get("state")?;
    let status = state
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("completed")
        .to_string();
    let input = state.get("input").cloned().unwrap_or(Value::Null);
    let output = content_text(state.get("content"));
    let error = state
        .pointer("/error/message")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            state
                .pointer("/error/type")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_default();
    let files = files_for_tool(&name, &input);
    let executed = value
        .get("executed")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Some(OpenCodeToolCall {
        id,
        name,
        status,
        input,
        output,
        error,
        executed,
        files,
    })
}

fn tool_event(data: &Value, status: &str, input: Option<Value>) -> Option<OpenCodeToolCall> {
    let id = data.get("id").and_then(Value::as_str)?.to_string();
    let name = data
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let input = input.unwrap_or(Value::Null);
    let output = content_text(data.get("content"));
    let error = data
        .pointer("/error/message")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            data.get("error")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_default();
    let files = files_for_tool(&name, &input);
    Some(OpenCodeToolCall {
        id,
        name,
        status: status.to_string(),
        input,
        output,
        error,
        executed: data
            .get("executed")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        files,
    })
}

fn normalized_tool_output(data: &Value) -> Value {
    data.get("input").cloned().unwrap_or(Value::Null)
}

fn parsed_input(raw: Option<&Value>) -> Value {
    let Some(raw) = raw else {
        return Value::Null;
    };
    let Some(text) = raw.as_str() else {
        return raw.clone();
    };
    serde_json::from_str(text).unwrap_or_else(|_| Value::String(text.to_string()))
}

fn content_text(content: Option<&Value>) -> String {
    content
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}

fn parse_tokens(value: &Value) -> Option<OpenCodeTokens> {
    let input = value.get("input").and_then(Value::as_u64).unwrap_or(0);
    let output = value.get("output").and_then(Value::as_u64).unwrap_or(0);
    let reasoning = value.get("reasoning").and_then(Value::as_u64).unwrap_or(0);
    let cache_read = value
        .pointer("/cache/read")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let cache_write = value
        .pointer("/cache/write")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    Some(OpenCodeTokens {
        input,
        output,
        reasoning,
        cache_read,
        cache_write,
    })
}

fn parse_model(value: Option<&Value>) -> Option<String> {
    let value = value?;
    let provider = value.get("providerID").and_then(Value::as_str)?;
    let id = value.get("id").and_then(Value::as_str)?;
    Some(format!("{provider}/{id}"))
}

fn string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn files_for_tool(name: &str, input: &Value) -> Vec<String> {
    if !name.is_empty()
        && !matches!(
            name,
            "read" | "edit" | "write" | "patch" | "multiedit" | "apply_patch"
        )
    {
        return Vec::new();
    }
    let mut files = Vec::new();
    collect_paths(input, &mut files);
    files.sort();
    files.dedup();
    files
}

fn collect_paths(value: &Value, files: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for key in ["path", "filePath", "file", "filename"] {
                if let Some(path) = map.get(key).and_then(Value::as_str) {
                    let path = path.trim();
                    if !path.is_empty() {
                        files.push(path.to_string());
                    }
                }
            }
            for key in ["files", "paths"] {
                if let Some(items) = map.get(key).and_then(Value::as_array) {
                    for item in items {
                        match item {
                            Value::String(path) => {
                                let path = path.trim();
                                if !path.is_empty() {
                                    files.push(path.to_string());
                                }
                            }
                            Value::Object(object) => {
                                if let Some(path) = object.get("path").and_then(Value::as_str) {
                                    let path = path.trim();
                                    if !path.is_empty() {
                                        files.push(path.to_string());
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
        Value::String(raw) => {
            if let Ok(parsed) = serde_json::from_str::<Value>(raw) {
                collect_paths(&parsed, files);
            }
        }
        _ => {}
    }
}

fn insert_data(event: &mut Value, key: &str, value: Value) {
    let Some(object) = event.as_object_mut() else {
        return;
    };
    let data = object
        .entry("data")
        .or_insert_with(|| Value::Object(Map::new()));
    if let Some(data) = data.as_object_mut() {
        data.insert(key.to_string(), value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_history_with_text_tools_tokens_and_files() {
        let message = parse_chat_message(&json!({
            "id": "msg_a",
            "type": "assistant",
            "model": { "providerID": "opencode-go", "id": "hy4" },
            "tokens": {
                "input": 10,
                "output": 4,
                "reasoning": 2,
                "cache": { "read": 7, "write": 1 }
            },
            "content": [
                { "type": "reasoning", "text": "pensando" },
                { "type": "text", "text": "Voy a leerlo." },
                {
                    "type": "tool",
                    "id": "tool_1",
                    "name": "read",
                    "state": {
                        "status": "completed",
                        "input": { "path": "notas.md" },
                        "content": [{ "type": "text", "text": "Hola" }]
                    }
                }
            ]
        }))
        .expect("assistant message");

        assert_eq!(message.text, "Voy a leerlo.");
        assert_eq!(message.model.as_deref(), Some("opencode-go/hy4"));
        assert_eq!(message.tokens.as_ref().unwrap().cache_read, 7);
        assert_eq!(message.parts.len(), 2);
        match &message.parts[1] {
            OpenCodeMessagePart::Tool { tool } => {
                assert_eq!(tool.name, "read");
                assert_eq!(tool.status, "completed");
                assert_eq!(tool.output, "Hola");
                assert_eq!(tool.files, vec!["notas.md"]);
            }
            _ => panic!("expected tool part"),
        }
    }

    #[test]
    fn normalizes_tool_and_permission_events() {
        let tool = normalize_event(json!({
            "type": "session.tool.success",
            "data": {
                "sessionID": "ses_a",
                "assistantMessageID": "msg_a",
                "id": "tool_1",
                "name": "write",
                "input": { "path": "capitulo.md" },
                "content": [{ "type": "text", "text": "Escrito" }],
                "executed": true
            }
        }));
        let normalized = tool.pointer("/data/tool").expect("normalized tool");
        assert_eq!(normalized["status"], "completed");
        assert_eq!(normalized["output"], "Escrito");
        assert_eq!(normalized["files"][0], "capitulo.md");
        assert_eq!(tool["type"], "session.tool.success");

        let permission = normalize_event(json!({
            "type": "permission.asked",
            "data": {
                "id": "per_1",
                "sessionID": "ses_a",
                "action": "edit",
                "resources": ["capitulo.md"],
                "save": ["*"],
                "source": { "type": "tool", "id": "tool_1", "messageID": "msg_a" }
            }
        }));
        let normalized = permission
            .pointer("/data/permission")
            .expect("normalized permission");
        assert_eq!(normalized["action"], "edit");
        assert_eq!(normalized["toolId"], "tool_1");
        assert_eq!(normalized["status"], "pending");

        // `tool.called` omits the name; file extraction must still work.
        let called = normalize_event(json!({
            "type": "session.tool.called",
            "data": {
                "sessionID": "ses_a",
                "assistantMessageID": "msg_a",
                "id": "tool_1",
                "input": { "path": "capitulo.md" },
                "executed": false
            }
        }));
        assert_eq!(
            called.pointer("/data/tool/files/0"),
            Some(&Value::String("capitulo.md".to_string()))
        );
    }

    #[test]
    fn parses_forms_and_normalizes_form_events() {
        let form = parse_form(&json!({
            "id": "frm_1",
            "sessionID": "ses_a",
            "title": "Questions",
            "metadata": {
                "kind": "question",
                "tool": { "id": "tool_q", "messageID": "msg_q" }
            },
            "fields": [{
                "key": "q0",
                "title": "Color favorito",
                "type": "string",
                "options": [{ "value": "Rojo", "label": "Rojo" }],
                "custom": true
            }]
        }))
        .expect("form");
        assert_eq!(form.kind, "question");
        assert_eq!(form.tool_id.as_deref(), Some("tool_q"));
        assert_eq!(form.status, "pending");
        assert_eq!(form.fields.as_array().unwrap().len(), 1);

        let created = normalize_event(json!({
            "type": "form.created",
            "data": {
                "form": {
                    "id": "frm_1",
                    "sessionID": "ses_a",
                    "title": "Questions",
                    "metadata": { "kind": "question" },
                    "fields": [{ "key": "q0", "type": "string" }]
                }
            }
        }));
        assert_eq!(
            created.pointer("/data/form/id"),
            Some(&Value::String("frm_1".to_string()))
        );

        let replied = normalize_event(json!({
            "type": "form.replied",
            "data": { "id": "frm_1", "sessionID": "ses_a", "answer": { "q0": "Rojo" } }
        }));
        assert_eq!(
            replied.pointer("/data/formReply/status"),
            Some(&Value::String("answered".to_string()))
        );
        assert_eq!(
            replied.pointer("/data/formReply/answer/q0"),
            Some(&Value::String("Rojo".to_string()))
        );

        let cancelled = normalize_event(json!({
            "type": "form.cancelled",
            "data": { "id": "frm_1", "sessionID": "ses_a" }
        }));
        assert_eq!(
            cancelled.pointer("/data/formReply/status"),
            Some(&Value::String("cancelled".to_string()))
        );
    }

    #[test]
    fn parses_pending_permissions_and_replies() {
        let permission = parse_permission(&json!({
            "id": "per_1",
            "sessionID": "ses_a",
            "action": "read",
            "resources": ["notas.md"],
            "save": ["*"],
            "source": { "type": "tool", "id": "tool_1", "messageID": "msg_a" }
        }))
        .expect("permission");
        assert_eq!(permission.session_id, "ses_a");
        assert_eq!(permission.resources, vec!["notas.md"]);
        assert_eq!(permission.tool_id.as_deref(), Some("tool_1"));

        let replied = normalize_event(json!({
            "type": "permission.replied",
            "data": {
                "sessionID": "ses_a",
                "requestID": "per_1",
                "reply": "reject"
            }
        }));
        assert_eq!(
            replied.pointer("/data/permissionReply/status"),
            Some(&Value::String("rejected".to_string()))
        );
    }
}
