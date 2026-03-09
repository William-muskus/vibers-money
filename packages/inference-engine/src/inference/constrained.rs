//! Phase 5: Grammar-constrained decoding for response_format: { type: "json_object" }.
//! Post-hoc extraction + token-level prefix check for constrained decoding.
//! Tool-call grammar: <tool_call>{"name":"<allowed_name>","arguments":<valid_json>}</tool_call>
#![allow(dead_code)]

/// Returns true if `s` is a valid prefix for tool-call output.
/// - Preamble: if `s` does not contain "<tool_call>", returns true (allow any token).
/// - After "<tool_call>": content after the last "<tool_call>" must be a valid prefix of
///   a JSON object {"name": "<one of allowed_names>", "arguments": <any JSON value>}.
pub fn is_valid_tool_call_prefix(s: &str, allowed_names: &[String]) -> bool {
    const MARKER: &str = "<tool_call>";
    let content = match s.rfind(MARKER) {
        Some(i) => s[i + MARKER.len()..].trim_start(),
        None => return true,
    };
    if allowed_names.is_empty() {
        return is_valid_json_object_prefix(content);
    }
    // Character-level FSM: track depth, string state, key vs value, and "name" value.
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;
    let mut quote = '\0';
    let mut key_buf = String::new();
    let mut keys_finished: Vec<String> = Vec::new();
    let mut expecting_value = false;
    let mut is_key_string = false; // true when current string is a key (not a value)
    let mut in_name_value = false;
    let mut name_value_buf = String::new();

    for c in content.chars() {
        if escape {
            escape = false;
            if in_name_value {
                name_value_buf.push(c);
            } else if is_key_string {
                key_buf.push(c);
            }
            continue;
        }
        if in_string {
            if c == '\\' {
                escape = true;
                if in_name_value {
                    name_value_buf.push(c);
                } else if is_key_string {
                    key_buf.push(c);
                }
            } else if c == quote {
                in_string = false;
                if in_name_value {
                    if !allowed_names
                        .iter()
                        .any(|n| n.starts_with(name_value_buf.as_str()))
                    {
                        return false;
                    }
                    in_name_value = false;
                    name_value_buf.clear();
                }
                if is_key_string {
                    keys_finished.push(key_buf.clone());
                    key_buf.clear();
                    is_key_string = false;
                }
            } else {
                if in_name_value {
                    name_value_buf.push(c);
                    if !allowed_names
                        .iter()
                        .any(|n| n.starts_with(name_value_buf.as_str()))
                    {
                        return false;
                    }
                } else if is_key_string {
                    key_buf.push(c);
                }
            }
            continue;
        }
        match c {
            '"' | '\'' => {
                in_string = true;
                quote = c;
                if expecting_value {
                    in_name_value = keys_finished.last().map(|k| k.as_str()) == Some("name");
                    expecting_value = false;
                } else {
                    is_key_string = true;
                }
            }
            ':' if depth == 1 && !keys_finished.is_empty() => {
                expecting_value = true;
            }
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth < 0 {
                    return false;
                }
            }
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth < 0 {
                    return false;
                }
            }
            _ => {}
        }
    }
    if in_name_value {
        return allowed_names
            .iter()
            .any(|n| n.starts_with(name_value_buf.as_str()));
    }
    depth >= 0
}

/// Returns true if `s` is a prefix of some valid JSON object (can be extended to valid JSON).
pub fn is_valid_json_object_prefix(s: &str) -> bool {
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;
    let mut quote = '\0';
    for c in s.chars() {
        if escape {
            escape = false;
            continue;
        }
        if in_string {
            if c == '\\' {
                escape = true;
            } else if c == quote {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' | '\'' => {
                in_string = true;
                quote = c;
            }
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth < 0 {
                    return false;
                }
            }
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth < 0 {
                    return false;
                }
            }
            _ => {}
        }
    }
    depth >= 0
}

/// Extract a valid JSON object from model output (first balanced `{`..`}`), or validate and re-serialize.
pub fn decode_constrained_json(output: &str) -> Result<String, String> {
    let trimmed = output.trim();
    let start = trimmed.find('{').ok_or_else(|| "no opening brace".to_string())?;
    let mut depth = 0u32;
    let mut in_string = false;
    let mut escape = false;
    let mut quote = b'\0';
    let bytes = trimmed.as_bytes();
    let mut end = start;
    for (i, &b) in bytes.iter().enumerate().skip(start) {
        if escape {
            escape = false;
            continue;
        }
        if in_string {
            if b == b'\\' {
                escape = true;
            } else if b == quote {
                in_string = false;
            }
            continue;
        }
        match b {
            b'"' | b'\'' => {
                in_string = true;
                quote = b;
            }
            b'{' => depth = depth.saturating_add(1),
            b'}' => {
                if depth == 0 {
                    return Err("unmatched }".to_string());
                }
                depth -= 1;
                if depth == 0 {
                    end = i + 1;
                    break;
                }
            }
            _ => {}
        }
    }
    if depth != 0 {
        return Err("unclosed object".to_string());
    }
    let slice = trimmed.get(start..end).ok_or_else(|| "slice error".to_string())?;
    let parsed: serde_json::Value =
        serde_json::from_str(slice).map_err(|e| format!("invalid json: {}", e))?;
    if !parsed.is_object() {
        return Err("top-level is not an object".to_string());
    }
    serde_json::to_string(&parsed).map_err(|e| e.to_string())
}

/// When request has response_format.json_object: run generator then return constrained JSON.
pub fn decode_constrained<F>(prompt: &str, mut generate: F, max_tokens: u32) -> Result<String, String>
where
    F: FnMut(&str, u32, f32) -> Result<Vec<String>, String>,
{
    let temp = 0.3f32;
    let tokens = generate(prompt, max_tokens, temp)?;
    let output = tokens.join("");
    decode_constrained_json(&output).or_else(|_| Ok(output))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed(names: &[&str]) -> Vec<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn test_tool_call_prefix_preamble() {
        // No <tool_call> -> allow any (preamble)
        assert!(is_valid_tool_call_prefix("", &allowed(&["get_weather"])));
        assert!(is_valid_tool_call_prefix("Some thinking", &allowed(&["get_weather"])));
        assert!(is_valid_tool_call_prefix("Let me call a tool", &allowed(&["x"])));
    }

    #[test]
    fn test_tool_call_prefix_valid_name() {
        let names = allowed(&["get_weather", "swarm_send_message"]);
        assert!(is_valid_tool_call_prefix("<tool_call>{\"name\":\"get_weather\"", &names));
        assert!(is_valid_tool_call_prefix("<tool_call>{\"name\":\"get_weat", &names));
        assert!(is_valid_tool_call_prefix("<tool_call>{\"name\":\"swarm_send_message\",\"arguments\":\"{}", &names));
        assert!(is_valid_tool_call_prefix("<tool_call>{\"name\":\"get_weather\",\"arguments\":\"{\\\"x\\\":1}\"}", &names));
    }

    #[test]
    fn test_tool_call_prefix_invalid_name() {
        let names = allowed(&["get_weather"]);
        assert!(!is_valid_tool_call_prefix("<tool_call>{\"name\":\"other_tool\"", &names));
        assert!(!is_valid_tool_call_prefix("<tool_call>{\"name\":\"get_weatherx\",", &names));
    }

    #[test]
    fn test_tool_call_prefix_bad_json() {
        let names = allowed(&["get_weather"]);
        // Extra closing brace makes depth negative
        assert!(!is_valid_tool_call_prefix("<tool_call>{\"name\":\"get_weather\"}}", &names));
    }

    #[test]
    fn test_tool_call_prefix_full_tool_call() {
        let names = allowed(&["get_weather"]);
        assert!(is_valid_tool_call_prefix(
            "<tool_call>{\"name\":\"get_weather\",\"arguments\":\"\"}</tool_call>",
            &names
        ));
    }
}
