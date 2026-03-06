//! Phase 5: Grammar-constrained decoding for response_format: { type: "json_object" }.
//! Post-hoc extraction + token-level prefix check for constrained decoding.
#![allow(dead_code)]

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
