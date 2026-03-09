//! Parse model output for tool-call patterns and convert to OpenAI-style tool_calls.
//! Supports <tool_call>...</tool_call> with JSON body (name + arguments) and bare JSON objects.
use serde_json::{Map, Value};
use uuid::Uuid;

/// Detect tool-call pattern in model output and return OpenAI-style tool_calls if found.
/// Returns (tool_calls, optional adjusted content). Content is unchanged if no tool calls found.
pub fn parse_tool_calls_from_content(raw: &str) -> Option<Vec<Value>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Pattern 1: <tool_call>{"name": "...", "arguments": ...}</tool_call> or multiple
    if let Some(calls) = parse_tool_call_tags(trimmed) {
        return Some(calls);
    }

    // Pattern 2: Last JSON object in the text with "name" and "arguments" (e.g. model output ends with a tool call)
    if let Some(call) = parse_trailing_json_tool_call(trimmed) {
        return Some(vec![call]);
    }

    None
}

/// Parse one or more <tool_call>...</tool_call> blocks. Inner content must be JSON with "name" and "arguments".
fn parse_tool_call_tags(text: &str) -> Option<Vec<Value>> {
    const OPEN: &str = "<tool_call>";
    const CLOSE: &str = "</tool_call>";
    let mut out = Vec::new();
    let mut rest = text;
    loop {
        let start = rest.find(OPEN)?;
        let after_open = &rest[start + OPEN.len()..];
        let end = after_open.find(CLOSE)?;
        let inner = after_open[..end].trim();
        if let Some(obj) = parse_tool_call_json(inner) {
            out.push(obj);
        }
        rest = &after_open[end + CLOSE.len()..];
        if rest.find(OPEN).is_none() {
            break;
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

/// Parse a single JSON object with "name" and "arguments" into OpenAI tool_call format.
fn parse_tool_call_json(s: &str) -> Option<Value> {
    let parsed: Value = serde_json::from_str(s).ok()?;
    let obj = parsed.as_object()?;
    let name = obj.get("name").and_then(|v| v.as_str())?;
    let arguments = obj.get("arguments").cloned().unwrap_or(Value::Object(Map::new()));
    let arguments_str = match &arguments {
        Value::String(s) => s.clone(),
        _ => arguments.to_string(),
    };
    Some(serde_json::json!({
        "id": format!("call_{}", Uuid::new_v4().simple()),
        "type": "function",
        "function": {
            "name": name,
            "arguments": arguments_str
        }
    }))
}

/// Find the last JSON object in the text that has "name" and "arguments" (tool call shape).
fn parse_trailing_json_tool_call(text: &str) -> Option<Value> {
    let mut depth = 0i32;
    let mut start = None;
    let bytes = text.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        match b {
            b'{' => {
                if depth == 0 {
                    start = Some(i);
                }
                depth += 1;
            }
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    if let Some(s) = start {
                        let slice = std::str::from_utf8(&bytes[s..=i]).ok()?;
                        if let Some(obj) = parse_tool_call_json(slice) {
                            return Some(obj);
                        }
                    }
                }
            }
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_tool_call_tag() {
        let s = r#"Thinking... <tool_call>{"name": "swarm_send_message", "arguments": "{\"to\": \"ceo\", \"content\": \"hi\"}"}</tool_call>"#;
        let calls = parse_tool_calls_from_content(s).unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0]["type"], "function");
        assert_eq!(calls[0]["function"]["name"], "swarm_send_message");
    }

    #[test]
    fn test_parse_trailing_json() {
        let s = r#"Some text {"name": "get_weather", "arguments": "{}"}"#;
        let calls = parse_tool_calls_from_content(s).unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0]["function"]["name"], "get_weather");
    }

    #[test]
    fn test_no_tool_call() {
        assert!(parse_tool_calls_from_content("Just some text").is_none());
        assert!(parse_tool_calls_from_content("").is_none());
    }
}
