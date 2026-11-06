//! Minimal Server-Sent Events reader for the OpenCode event stream.
//!
//! OpenCode sends one JSON object per `data:` line, separated by blank lines,
//! with periodic `: heartbeat` comments. The reader keeps only what the UI
//! needs and ignores unknown event types at the consumer.

use std::io::BufRead;

use serde_json::Value;

/// Parse an SSE stream, calling `on_event` for every JSON `data:` payload.
pub fn read_events<R: BufRead>(reader: R, mut on_event: impl FnMut(Value)) -> Result<(), String> {
    let mut data = String::new();
    for line in reader.lines() {
        let line =
            line.map_err(|error| format!("No se pudo leer el stream de OpenCode: {error}"))?;
        if let Some(rest) = line.strip_prefix("data:") {
            if !data.is_empty() {
                data.push('\n');
            }
            data.push_str(rest.trim_start());
        } else if line.trim().is_empty() && !data.is_empty() {
            if let Ok(event) = serde_json::from_str::<Value>(&data) {
                on_event(event);
            }
            data.clear();
        }
        // `: heartbeat` and other SSE fields are intentionally ignored.
    }
    if !data.is_empty() {
        if let Ok(event) = serde_json::from_str::<Value>(&data) {
            on_event(event);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn reads_multiple_events_and_ignores_heartbeats() {
        let raw = concat!(
            ": heartbeat\n\n",
            "data: {\"type\":\"session.text.delta\",\"data\":{\"delta\":\"hola\"}}\n\n",
            ": heartbeat\n\n",
            "data: {\"type\":\"session.execution.succeeded\",\"data\":{}}\n\n",
        );
        let mut events = Vec::new();
        read_events(Cursor::new(raw), |event| events.push(event)).unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["type"], "session.text.delta");
        assert_eq!(events[0]["data"]["delta"], "hola");
        assert_eq!(events[1]["type"], "session.execution.succeeded");
    }

    #[test]
    fn ignores_malformed_payloads() {
        let raw = "data: not-json\n\ndata: {\"type\":\"ok\"}\n\n";
        let mut events = Vec::new();
        read_events(Cursor::new(raw), |event| events.push(event)).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["type"], "ok");
    }
}
