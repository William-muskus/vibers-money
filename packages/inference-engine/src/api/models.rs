//! GET /v1/models — list loaded models (config-driven, else env). When VIBERS_INFERENCE_PROXY_URL is set, forwards to that backend.
use axum::{extract::State, response::IntoResponse, Json};

use crate::api::error::ApiError;
use crate::api::types::{ModelInfo, ModelListResponse};
use crate::config::AppState;

fn proxy_url() -> Option<String> {
    std::env::var("VIBERS_INFERENCE_PROXY_URL")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Models from state (roles.toml); if empty, fall back to LOCAL_LLM_MODEL env.
fn list_models(state: &AppState) -> Vec<ModelInfo> {
    if !state.roles_config.model_ids.is_empty() {
        return state
            .roles_config
            .model_ids
            .iter()
            .map(|id| ModelInfo {
                id: id.clone(),
                object: "model".to_string(),
                created: 0,
                owned_by: "vibers-inference".to_string(),
            })
            .collect();
    }
    let default_id =
        std::env::var("LOCAL_LLM_MODEL").unwrap_or_else(|_| "mistral:7b".to_string());
    vec![ModelInfo {
        id: default_id,
        object: "model".to_string(),
        created: 0,
        owned_by: "vibers-inference".to_string(),
    }]
}

pub async fn get_models(State(state): State<AppState>) -> Result<impl IntoResponse, ApiError> {
    if let Some(base) = proxy_url() {
        let url = format!("{}/v1/models", base.trim_end_matches('/'));
        let client = reqwest::Client::new();
        let res = client
            .get(&url)
            .send()
            .await
            .map_err(|e| ApiError::internal(format!("proxy models request failed: {}", e)))?;
        let status = res.status();
        let mut response = axum::response::Response::builder().status(status);
        for (k, v) in res.headers() {
            if let Ok(name) = axum::http::HeaderName::try_from(k.as_str()) {
                if let Ok(value) = axum::http::HeaderValue::try_from(v.as_bytes()) {
                    response = response.header(name, value);
                }
            }
        }
        let body = axum::body::Body::from_stream(res.bytes_stream());
        let response = response
            .body(body)
            .map_err(|e| ApiError::internal(format!("proxy response build: {}", e)))?;
        return Ok(response.into_response());
    }
    let data = list_models(&state);
    Ok(Json(ModelListResponse {
        object: "list".to_string(),
        data,
    })
    .into_response())
}
