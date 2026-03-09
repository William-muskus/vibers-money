//! POST /v1/chat/completions — streaming and non-streaming (OpenAI-compatible).
//! When VIBERS_INFERENCE_PROXY_URL is set, forwards to that backend; otherwise uses Candle engine (if loaded) or 503.
use axum::{
    body::Body,
    extract::{Json, State},
    response::{IntoResponse, Response},
};
use bytes::Bytes;
use futures_util::stream;
use serde_json::json;
use std::time::Duration;
use std::time::SystemTime;
use uuid::Uuid;

use crate::api::error::ApiError;
use crate::api::tool_calls::parse_tool_calls_from_content;
use crate::api::types::{
    ChatCompletionRequest, ChatCompletionResponse, ChatChoice, ChatChoiceMessage, ToolChoice,
    Usage,
};
use crate::config::AppState;

fn inference_timeout_secs() -> u64 {
    std::env::var("VIBERS_INFERENCE_TIMEOUT_SECS")
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(300)
}

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
        let has_tools = payload.tools.as_ref().map_or(false, |t| !t.is_empty())
            || payload.tool_choice.is_some();
        if has_tools {
            return proxy_chat(&base, &payload).await;
        }
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
            let stop_vec: Vec<String> = payload
                .stop
                .as_ref()
                .map(|s| s.as_strings())
                .unwrap_or_default();
            let id = format!("chatcmpl-{}", Uuid::new_v4().simple());
            let model = payload.model.clone();
            let created = unix_ts();
            let timeout_duration = Duration::from_secs(inference_timeout_secs());
            let tokens: Vec<String> = match tokio::time::timeout(
                timeout_duration,
                tokio::task::spawn_blocking(move || {
                    let guard = match arc.lock() {
                        Ok(g) => g,
                        Err(_) => return Vec::new(),
                    };
                    if !guard.has_model() {
                        return Vec::new();
                    }
                    let stop_ref: Option<&[String]> =
                        if stop_vec.is_empty() { None } else { Some(&stop_vec) };
                    let mut out = Vec::new();
                    let _ = guard.generate_stream_callback(
                        &prompt,
                        max_tokens,
                        temp,
                        stop_ref,
                        |s| out.push(s),
                    );
                    out
                }),
            )
            .await
            {
                Ok(Ok(t)) => t.unwrap_or_default(),
                Ok(Err(_)) => Vec::new(),
                Err(_) => {
                    return Err(ApiError::service_unavailable(
                        "Inference timed out; consider increasing VIBERS_INFERENCE_TIMEOUT_SECS.",
                    ));
                }
            };
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
                let stop_vec: Vec<String> = payload
                    .stop
                    .as_ref()
                    .map(|s| s.as_strings())
                    .unwrap_or_default();
                let stop_ref: Option<&[String]> =
                    if stop_vec.is_empty() { None } else { Some(&stop_vec) };

                let allowed_tool_names: Vec<String> = match &payload.tool_choice {
                    Some(ToolChoice::Named { name }) => vec![name.clone()],
                    _ => payload
                        .tools
                        .as_ref()
                        .map(|t| {
                            t.iter()
                                .filter_map(|tool| {
                                    tool.function.as_ref().and_then(|f| f.name.clone())
                                })
                                .collect()
                        })
                        .unwrap_or_default(),
                };

                if !allowed_tool_names.is_empty() {
                    let k = state.roles_config.draft_tokens.unwrap_or(4);
                    let tokens = if guard.has_draft_model() {
                        guard.generate_speculative_tool_call(
                            &prompt,
                            k,
                            max_tokens,
                            temp,
                            stop_ref,
                            &allowed_tool_names,
                        )
                    } else {
                        guard.generate_constrained_tool_call(
                            &prompt,
                            &allowed_tool_names,
                            max_tokens,
                            temp,
                            stop_ref,
                        )
                    };
                    if let Ok(tokens) = tokens {
                        let content = tokens.join("");
                        let prompt_tokens = (prompt.len() / 4).max(1) as u32;
                        let completion_tokens = (content.len() / 4).max(1) as u32;
                        if let Some(tool_calls) = parse_tool_calls_from_content(&content) {
                            return Ok(build_completion_response_with_tool_calls(
                                &payload.model,
                                content,
                                tool_calls,
                                prompt_tokens,
                                completion_tokens,
                            ));
                        }
                        return Ok(build_completion_response(
                            &payload.model,
                            content,
                            prompt_tokens,
                            completion_tokens,
                        ));
                    }
                }

                if guard.has_draft_model() {
                    let k = state.roles_config.draft_tokens.unwrap_or(4);
                    if let Ok(tokens) =
                        guard.generate_speculative(&prompt, k, max_tokens, temp, stop_ref)
                    {
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
                        if payload.tools.as_ref().map_or(false, |t| !t.is_empty()) {
                            if let Some(tool_calls) = parse_tool_calls_from_content(&content) {
                                return Ok(build_completion_response_with_tool_calls(
                                    &payload.model,
                                    content,
                                    tool_calls,
                                    prompt_tokens,
                                    completion_tokens,
                                ));
                            }
                        }
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
                    guard.generate_constrained_json(&prompt, max_tokens, temp, stop_ref)
                } else {
                    guard.generate(&prompt, max_tokens, temp, stop_ref)
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
                    if payload.tools.as_ref().map_or(false, |t| !t.is_empty()) {
                        if let Some(tool_calls) = parse_tool_calls_from_content(&content) {
                            return Ok(build_completion_response_with_tool_calls(
                                &payload.model,
                                content,
                                tool_calls,
                                prompt_tokens,
                                completion_tokens,
                            ));
                        }
                    }
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
        return Err(ApiError::service_unavailable(
            "No inference model loaded; set MODEL_PATH and ensure the file is accessible.",
        ));
    }
    Err(ApiError::service_unavailable(
        "No inference model loaded; set MODEL_PATH and ensure the file is accessible.",
    ))
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

fn build_completion_response_with_tool_calls(
    model: &str,
    content: String,
    tool_calls: Vec<serde_json::Value>,
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
                content: if content.trim().is_empty() {
                    None
                } else {
                    Some(content)
                },
                tool_calls: Some(tool_calls),
            },
            finish_reason: Some("tool_calls".to_string()),
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
