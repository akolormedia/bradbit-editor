//! Contract tests for the OpenCode HTTP client against a local mock server.
//! No real OpenCode process, model or network is involved.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

use bradbit_editor_lib::opencode::client::OpenCodeClient;

#[derive(Debug, Clone)]
struct Recorded {
    method: String,
    target: String,
    headers: Vec<(String, String)>,
    body: String,
}

fn spawn_mock() -> (String, Arc<Mutex<Vec<Recorded>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock");
    let base = format!("http://{}", listener.local_addr().expect("addr"));
    let recorded = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&recorded);
    thread::spawn(move || {
        for _ in 0..12 {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let Ok(request) = read_request(&mut stream) else {
                return;
            };
            sink.lock().expect("lock").push(request.clone());
            let (content_type, body) = if request.target == "/api/info" {
                ("application/json", r#"{"version":"2.2.5"}"#.to_string())
            } else if request.target == "/api/model" {
                (
                    "application/json",
                    r#"{"data":[{"id":"fake","modelID":"fake","name":"Fake"}]}"#.to_string(),
                )
            } else if request.target == "/api/session" && request.method == "GET" {
                (
                    "application/json",
                    concat!(
                        r#"{"data":["#,
                        r#"{"id":"ses_test","title":"Sesión 1","time":{"created":1,"updated":42},"location":{"directory":"/proyecto"}},"#,
                        r#"{"id":"ses_other","title":"Otra","time":{"created":1,"updated":2},"location":{"directory":"/otro"}}"#,
                        r#"]}"#,
                    )
                    .to_string(),
                )
            } else if request.target == "/api/session" {
                (
                    "application/json",
                    r#"{"data":{"id":"ses_test","title":"Sesión 1"}}"#.to_string(),
                )
            } else if request.target == "/api/session/ses_test/prompt" {
                (
                    "application/json",
                    r#"{"data":{"id":"msg_test"}}"#.to_string(),
                )
            } else if request.target == "/api/session/ses_test/interrupt" {
                ("application/json", r#"{"interrupted":true}"#.to_string())
            } else if request.target == "/api/session/ses_test/permission"
                && request.method == "GET"
            {
                (
                    "application/json",
                    concat!(
                        r#"{"data":["#,
                        r#"{"id":"per_1","sessionID":"ses_test","action":"edit","resources":["notas.md"],"save":["*"],"source":{"type":"tool","messageID":"msg_assistant","id":"tool_1"}}"#,
                        r#"]}"#,
                    )
                    .to_string(),
                )
            } else if request.target == "/api/session/ses_test/permission/per_1/reply" {
                ("application/json", String::new())
            } else if request.target == "/api/session/ses_test/form" {
                (
                    "application/json",
                    concat!(
                        r#"{"data":["#,
                        r#"{"id":"frm_1","sessionID":"ses_test","title":"Questions","metadata":{"kind":"question","tool":{"messageID":"msg_assistant","id":"tool_q"}},"fields":[{"key":"q0","title":"Color favorito","type":"string","options":[{"value":"Rojo","label":"Rojo"}],"custom":true}]}"#,
                        r#"]}"#,
                    )
                    .to_string(),
                )
            } else if request.target == "/api/session/ses_test/form/frm_1/reply" {
                ("application/json", String::new())
            } else if request.target.starts_with("/api/session/ses_test/message") {
                (
                    "application/json",
                    concat!(
                        r#"{"data":["#,
                        r#"{"id":"msg_user","type":"user","text":"Hola"},"#,
                        r#"{"id":"msg_assistant","type":"assistant","tokens":{"input":10,"output":4,"reasoning":2,"cache":{"read":7,"write":1}},"content":[{"type":"reasoning","text":"pensando"},{"type":"text","text":"ok"},{"type":"tool","id":"tool_1","name":"read","state":{"status":"completed","input":{"path":"notas.md"},"content":[{"type":"text","text":"Hola"}]}}]},"#,
                        r#"{"id":"msg_tool","type":"assistant","content":[{"type":"tool","name":"read"}]}"#,
                        r#"]}"#,
                    )
                    .to_string(),
                )
            } else if request.target == "/api/event" {
                (
                    "text/event-stream",
                    concat!(
                        "data: {\"type\":\"session.text.delta\",\"data\":{\"delta\":\"hola\"}}\n\n",
                        "data: {\"type\":\"session.execution.succeeded\",\"data\":{}}\n\n",
                    )
                    .to_string(),
                )
            } else {
                ("application/json", r#"{"message":"not found"}"#.to_string())
            };
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(body.as_bytes());
            let _ = stream.flush();
        }
    });
    (base, recorded)
}

fn read_request(stream: &mut TcpStream) -> std::io::Result<Recorded> {
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 4096];
    let head_end = loop {
        let read = stream.read(&mut chunk)?;
        if read == 0 {
            break buffer.len();
        }
        buffer.extend_from_slice(&chunk[..read]);
        if let Some(position) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
            break position + 4;
        }
    };
    let head = String::from_utf8_lossy(&buffer[..head_end]).to_string();
    let mut lines = head.split("\r\n");
    let request_line = lines.next().unwrap_or_default().to_string();
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let target = parts.next().unwrap_or_default().to_string();
    let headers: Vec<(String, String)> = lines
        .filter_map(|line| {
            let (name, value) = line.split_once(':')?;
            Some((name.trim().to_ascii_lowercase(), value.trim().to_string()))
        })
        .collect();
    let content_length: usize = headers
        .iter()
        .find(|(name, _)| name == "content-length")
        .and_then(|(_, value)| value.parse().ok())
        .unwrap_or(0);
    let mut body = String::from_utf8_lossy(&buffer[head_end..]).to_string();
    let mut body_read = body.len();
    while body_read < content_length {
        let read = stream.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        body.push_str(&String::from_utf8_lossy(&chunk[..read]));
        body_read += read;
    }
    Ok(Recorded {
        method,
        target,
        headers,
        body,
    })
}

#[test]
fn client_covers_info_models_sessions_prompts_interrupts_and_events() {
    let (base, recorded) = spawn_mock();
    let client = OpenCodeClient::new(&base, "testpass");

    assert_eq!(client.info().unwrap(), "2.2.5");
    assert_eq!(client.list_models().unwrap().len(), 1);

    let sessions = client.list_sessions().unwrap();
    assert_eq!(sessions.len(), 2);
    assert_eq!(sessions[0].title, "Sesión 1");
    assert_eq!(sessions[0].updated, Some(42));
    assert_eq!(sessions[0].directory.as_deref(), Some("/proyecto"));

    let session = client.create_session("Sesión 1").unwrap();
    assert_eq!(session.id, "ses_test");
    client.prompt("ses_test", "hola").unwrap();
    assert!(client.interrupt("ses_test").unwrap());

    let messages = client.session_messages("ses_test").unwrap();
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0].role, "user");
    assert_eq!(messages[0].text, "Hola");
    assert_eq!(messages[1].role, "assistant");
    assert_eq!(messages[1].text, "ok");
    assert_eq!(messages[1].tokens.as_ref().unwrap().cache_read, 7);
    assert_eq!(messages[1].parts.len(), 2);
    match &messages[1].parts[1] {
        bradbit_editor_lib::opencode::chat::OpenCodeMessagePart::Tool { tool } => {
            assert_eq!(tool.files, vec!["notas.md"]);
            assert_eq!(tool.output, "Hola");
        }
        _ => panic!("expected tool part"),
    }

    let permissions = client.pending_permissions("ses_test").unwrap();
    assert_eq!(permissions.len(), 1);
    assert_eq!(permissions[0].action, "edit");
    assert_eq!(permissions[0].tool_id.as_deref(), Some("tool_1"));
    client
        .reply_permission("ses_test", "per_1", "once")
        .unwrap();

    let forms = client.pending_forms("ses_test").unwrap();
    assert_eq!(forms.len(), 1);
    assert_eq!(forms[0].kind, "question");
    assert_eq!(forms[0].fields.as_array().unwrap().len(), 1);
    client
        .reply_form("ses_test", "frm_1", &serde_json::json!({ "q0": "Rojo" }))
        .unwrap();

    let mut events = Vec::new();
    client.subscribe_events(|event| events.push(event)).unwrap();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0]["type"], "session.text.delta");
    assert_eq!(events[0]["data"]["delta"], "hola");
    assert_eq!(events[1]["type"], "session.execution.succeeded");

    let log = recorded.lock().unwrap().clone();
    assert!(log.iter().all(|request| {
        request
            .headers
            .iter()
            .any(|(name, value)| name == "authorization" && value.starts_with("Basic "))
    }));
    assert!(log
        .iter()
        .any(|request| request.method == "POST" && request.target == "/api/session"));
    let prompt = log
        .iter()
        .find(|request| request.target == "/api/session/ses_test/prompt")
        .expect("prompt request");
    assert_eq!(prompt.method, "POST");
    let body: serde_json::Value = serde_json::from_str(&prompt.body).unwrap();
    assert_eq!(body["text"], "hola");

    let reply = log
        .iter()
        .find(|request| request.target == "/api/session/ses_test/permission/per_1/reply")
        .expect("permission reply request");
    let body: serde_json::Value = serde_json::from_str(&reply.body).unwrap();
    assert_eq!(body["decision"], "once");

    let form_reply = log
        .iter()
        .find(|request| request.target == "/api/session/ses_test/form/frm_1/reply")
        .expect("form reply request");
    let body: serde_json::Value = serde_json::from_str(&form_reply.body).unwrap();
    assert_eq!(body["answer"]["q0"], "Rojo");
}

#[test]
fn client_rejects_empty_prompts_before_touching_the_server() {
    let client = OpenCodeClient::new("http://127.0.0.1:1", "testpass");
    assert!(client.prompt("ses_test", "   ").is_err());
    assert!(client.prompt("../bad", "hola").is_err());
}
