//! POST /v1/chat/completions — streaming and non-streaming (OpenAI-compatible).
//! When VIBERS_INFERENCE_PROXY_URL is set, forwards to that backend; otherwise uses Candle engine (if loaded) or stub.
use axum::{
    body::Body,
    extract::{Json, State},
    response::{IntoResponse, Response},
};
use bytes::Bytes;
use futures_util::stream;
use serde_json::json;
use std::time::SystemTime;
use uuid::Uuid;

use crate::api::error::ApiError;
use crate::api::types::{
    ChatCompletionRequest, ChatCompletionResponse, ChatChoice, ChatChoiceMessage, Usage,
};
use crate::config::AppState;

fn unix_ts() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn proxy_url() -> Option<String> {
    std::env::var("VIBERS_INFERENCE_PROXY_URL")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Non-streaming response: proxy, then Candle engine (if loaded), then stub.
pub async fn chat_completions(
    State(state): State<AppState>,
    Json(payload): Json<ChatCompletionRequest>,
) -> Result<Response, ApiError> {
    if payload.messages.is_empty() {
        return Err(ApiError::bad_request("messages array cannot be empty"));
    }
    if let Some(base) = proxy_url() {
        if let Ok(resp) = proxy_chat(&base, &payload).await {
            return Ok(resp);
        }
    }
    #[cfg(feature = "candle")]
    if payload.stream.unwrap_or(false) {
        if let Some(ref engine_lock) = state.inference_engine {
            let arc = engine_lock.clone();
            let prompt = build_prompt_from_messages(&payload.messages);
            let max_tokens = payload.max_tokens.unwrap_or(256);
            let temp = payload.temperature.unwrap_or(0.7);
            let id = format!("chatcmpl-{}", Uuid::new_v4().simple());
            let model = payload.model.clone();
            let created = unix_ts();
            let tokens: Vec<String> = tokio::task::spawn_blocking(move || {
                let guard = match arc.lock() {
                    Ok(g) => g,
                    Err(_) => return Vec::new(),
                };
                if !guard.has_model() {
                    return Vec::new();
                }
                let mut out = Vec::new();
                let _ = guard.generate_stream_callback(&prompt, max_tokens, temp, |s| out.push(s));
                out
            })
            .await
            .unwrap_or_default();
            if !tokens.is_empty() {
                let id2 = id.clone();
                let model2 = model.clone();
                let chunks = tokens
                    .into_iter()
                    .map(move |t| {
                        Ok::<_, std::convert::Infallible>(Bytes::from(format!(
                            "data: {}\n\n",
                            json!({
                                "id": id,
                                "object": "chat.completion.chunk",
                                "created": created,
                                "model": model,
                                "choices": [{
                                    "index": 0,
                                    "delta": { "content": t },
                                    "finish_reason": null
                                }]
                            })
                        )))
                    })
                    .chain([
                        Ok(Bytes::from(format!(
                            "data: {}\n\n",
                            json!({
                                "id": id2,
                                "object": "chat.completion.chunk",
                                "created": created,
                                "model": model2,
                                "choices": [{ "index": 0, "delta": {}, "finish_reason": "stop" }]
                            })
                        ))),
                        Ok(Bytes::from("data: [DONE]\n\n")),
                    ]);
                let body = Body::from_stream(stream::iter(chunks));
                return Ok(Response::builder()
                    .header("Content-Type", "text/event-stream")
                    .header("Cache-Control", "no-cache")
                    .header("Connection", "keep-alive")
                    .body(body)
                    .expect("response builder")
                    .into_response());
            }
        }
    }

    #[cfg(feature = "candle")]
    if let Some(ref engine_lock) = state.inference_engine {
        if let Ok(guard) = engine_lock.lock() {
            if guard.has_model() {
                let prompt = build_prompt_from_messages(&payload.messages);
                let max_tokens = payload.max_tokens.unwrap_or(256);
                let temp = payload.temperature.unwrap_or(0.7);
                if guard.has_draft_model() {
                    let k = state.roles_config.draft_tokens.unwrap_or(4);
                    if let Ok(tokens) = guard.generate_speculative(&prompt, k, max_tokens, temp) {
                        let content = if payload
                            .response_format
                            .as_ref()
                            .and_then(|r| r.r#type.as_deref())
                            == Some("json_object")
                        {
                            let raw = tokens.join("");
                            crate::inference::constrained::decode_constrained_json(&raw).unwrap_or(raw)
                        } else {
                            tokens.join("")
                        };
                        let prompt_tokens = (prompt.len() / 4).max(1) as u32;
                        let completion_tokens = (content.len() / 4).max(1) as u32;
                        return Ok(build_completion_response(
                            &payload.model,
                            content,
                            prompt_tokens,
                            completion_tokens,
                        ));
                    }
                }
                let is_json_object = payload
                    .response_format
                    .as_ref()
                    .and_then(|r| r.r#type.as_deref())
                    == Some("json_object");
                let tokens = if is_json_object {
                    guard.generate_constrained_json(&prompt, max_tokens, temp)
                } else {
                    guard.generate(&prompt, max_tokens, temp)
                };
                if let Ok(tokens) = tokens {
                    let content = if is_json_object {
                        let raw = tokens.join("");
                        crate::inference::constrained::decode_constrained_json(&raw).unwrap_or(raw)
                    } else {
                        tokens.join("")
                    };
                    let prompt_tokens = (prompt.len() / 4).max(1) as u32;
                    let completion_tokens = (content.len() / 4).max(1) as u32;
                    return Ok(build_completion_response(
                        &payload.model,
                        content,
                        prompt_tokens,
                        completion_tokens,
                    ));
                }
            }
        }
    }
    let stream = payload.stream.unwrap_or(false);
    if stream {
        return Ok(stream_chat(payload).await);
    }
    Ok(non_stream_chat(payload).await)
}

/// Mistral Instruct format so the model replies instead of echoing. Without [INST]...[/INST] the model does completion and may repeat the prompt.
fn build_prompt_from_messages(messages: &[crate::api::types::ChatMessage]) -> String {
    let mut s = String::new();
    let mut system: Option<&str> = None;
    let mut rest = messages;
    if let Some(first) = rest.first() {
        if first.role.eq_ignore_ascii_case("system") {
            system = first.content.as_deref();
            rest = &rest[1..];
        }
    }
    if let Some(sys) = system {
        let sys = sys.trim();
        if !sys.is_empty() {
            s.push_str("[INST] ");
            s.push_str(sys);
            s.push_str(" [/INST]\n\n");
        }
    }
    let n = rest.len();
    for (i, m) in rest.iter().enumerate() {
        let content = m.content.as_deref().unwrap_or("").trim();
        let is_user = m.role.eq_ignore_ascii_case("user");
        let is_assistant = m.role.eq_ignore_ascii_case("assistant");
        if is_user {
            s.push_str("[INST] ");
            s.push_str(content);
            s.push_str(" [/INST]");
            let is_last = i + 1 >= n;
            if !is_last {
                s.push_str("\n\n");
            } else {
                s.push(' ');
            }
        } else if is_assistant {
            s.push_str(content);
            if i + 1 < n {
                s.push_str("\n\n");
            }
        }
    }
    s
}

fn build_completion_response(
    model: &str,
    content: String,
    prompt_tokens: u32,
    completion_tokens: u32,
) -> Response {
    let id = format!("chatcmpl-{}", Uuid::new_v4().simple());
    let response = ChatCompletionResponse {
        id: id.clone(),
        object: "chat.completion".to_string(),
        created: unix_ts(),
        model: model.to_string(),
        choices: vec![ChatChoice {
            index: 0,
            message: ChatChoiceMessage {
                role: "assistant".to_string(),
                content: Some(content),
                tool_calls: None,
            },
            finish_reason: Some("stop".to_string()),
        }],
        usage: Some(Usage {
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
        }),
    };
    Json(response).into_response()
}

/// Forward request to proxy and return its response (streaming or non-streaming).
async fn proxy_chat(base: &str, payload: &ChatCompletionRequest) -> Result<Response, ApiError> {
    let url = format!("{}/v1/chat/completions", base.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let _stream = payload.stream.unwrap_or(false);
    let res = client
        .post(&url)
        .json(payload)
        .send()
        .await
        .map_err(|e| ApiError::internal(format!("proxy request failed: {}", e)))?;
    let status = res.status();
    let mut response = Response::builder().status(status);
    for (k, v) in res.headers() {
        if let Ok(name) = axum::http::HeaderName::try_from(k.as_str()) {
            if let Ok(value) = axum::http::HeaderValue::try_from(v.as_bytes()) {
                response = response.header(name, value);
            }
        }
    }
    let body = Body::from_stream(res.bytes_stream());
    let response = response
        .body(body)
        .map_err(|e| ApiError::internal(format!("proxy response build: {}", e)))?;
    Ok(response.into_response())
}

async fn non_stream_chat(payload: ChatCompletionRequest) -> Response {
    let id = format!("chatcmpl-{}", Uuid::new_v4().simple());
    // Stub: echo last user message or placeholder. Replace with real inference when Candle is wired.
    let content = payload
        .messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .and_then(|m| m.content.as_deref())
        .unwrap_or("")
        .to_string();
    let prompt_tokens = 0;
    let completion_tokens = 1.max(content.len() as u32 / 4);

    let response = ChatCompletionResponse {
        id: id.clone(),
        object: "chat.completion".to_string(),
        created: unix_ts(),
        model: payload.model,
        choices: vec![ChatChoice {
            index: 0,
            message: ChatChoiceMessage {
                role: "assistant".to_string(),
                content: if content.is_empty() {
                    Some("[vibers-inference stub: wire Candle for real completions]".to_string())
                } else {
                    Some(content)
                },
                tool_calls: None,
            },
            finish_reason: Some("stop".to_string()),
        }],
        usage: Some(Usage {
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
        }),
    };
    Json(response).into_response()
}

async fn stream_chat(payload: ChatCompletionRequest) -> Response {
    let id = format!("chatcmpl-{}", Uuid::new_v4().simple());
    let content = payload
        .messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .and_then(|m| m.content.as_deref())
        .unwrap_or("")
        .to_string();
    let stub = if content.is_empty() {
        "[stub]"
    } else {
        &content
    };
    let created = unix_ts();
    let model = payload.model.clone();
    // SSE: content chunk, then final chunk with finish_reason, then data: [DONE]
    let content_chunk = format!(
        "data: {}\n\n",
        json!({
            "id": id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{
                "index": 0,
                "delta": { "content": stub },
                "finish_reason": null
            }]
        })
    );
    let final_chunk = format!(
        "data: {}\n\n",
        json!({
            "id": id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {},
                "finish_reason": "stop"
            }]
        })
    );
    let s = format!("{content_chunk}{final_chunk}data: [DONE]\n\n");
    let body = Body::from(s);
    Response::builder()
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(body)
        .expect("valid response builder state")
        .into_response()
}
