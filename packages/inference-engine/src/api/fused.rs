//! POST /v1/fused — fused chain (Agent A → Agent B) for Phase 6.
//! Resolves from_role and to_role to models from roles.toml, runs A on input then B on bridge, returns content.
//! Reuses a single engine from state; loads from_path then to_path only when needed.
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use crate::config::AppState;

#[derive(Debug, Deserialize)]
pub struct FusedRequest {
    pub from_role: String,
    pub to_role: String,
    pub input: String,
    pub business_id: String,
}

#[derive(Debug, Serialize)]
pub struct FusedResponse {
    pub ok: bool,
    pub content: String,
    pub error: Option<String>,
}

#[cfg(feature = "candle")]
fn fused_impl_with_engine(
    state: &AppState,
    from_path: &str,
    to_path: &str,
    input: &str,
) -> Result<String, String> {
    let fused = state
        .fused_engine
        .as_ref()
        .ok_or_else(|| "fused engine not available".to_string())?;
    let mut guard = fused.lock().map_err(|e| e.to_string())?;
    let from_resolved = crate::inference::engine::resolve_model_path(from_path);
    let to_resolved = crate::inference::engine::resolve_model_path(to_path);
    let from_str = from_resolved.to_string_lossy().to_string();
    let to_str = to_resolved.to_string_lossy().to_string();

    if guard.loaded_path.as_deref() != Some(from_str.as_str()) {
        guard
            .engine
            .load_model(from_resolved.as_path())
            .map_err(|e| format!("load from_role model: {}", e))?;
        guard.loaded_path = Some(from_str.clone());
    }
    let bridge = guard
        .engine
        .generate(input, 512, 0.7, None)?
        .join("");

    if to_str != from_str {
        guard
            .engine
            .load_model(to_resolved.as_path())
            .map_err(|e| format!("load to_role model: {}", e))?;
        guard.loaded_path = Some(to_str);
    }
    let prompt = format!(
        "Context from previous agent:\n\n{}\n\nRespond concisely:",
        bridge
    );
    let content = guard
        .engine
        .generate(&prompt, 512, 0.7, None)?
        .join("");
    Ok(content)
}

#[cfg(not(feature = "candle"))]
fn fused_impl_with_engine(
    _state: &AppState,
    _from_path: &str,
    _to_path: &str,
    _input: &str,
) -> Result<String, String> {
    Err("fused requires --features candle".to_string())
}

pub async fn fused(
    State(state): State<AppState>,
    Json(body): Json<FusedRequest>,
) -> Json<FusedResponse> {
    let from_path = state
        .roles_config
        .role_models
        .get(&body.from_role)
        .map(String::as_str);
    let to_path = state
        .roles_config
        .role_models
        .get(&body.to_role)
        .map(String::as_str);
    let (from_path, to_path) = match (from_path, to_path) {
        (Some(a), Some(b)) => (a, b),
        _ => {
            return Json(FusedResponse {
                ok: false,
                content: String::new(),
                error: Some(format!(
                    "role models not in config: from_role={} to_role={}; ensure roles.toml has [roles.{}] and [roles.{}] with model = \"path\"",
                    body.from_role,
                    body.to_role,
                    body.from_role,
                    body.to_role
                )),
            })
        }
    };
    match fused_impl_with_engine(&state, from_path, to_path, &body.input) {
        Ok(content) => Json(FusedResponse {
            ok: true,
            content,
            error: None,
        }),
        Err(e) => Json(FusedResponse {
            ok: false,
            content: String::new(),
            error: Some(e),
        }),
    }
}
