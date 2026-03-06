//! POST /v1/fused — fused chain (Agent A → Agent B) for Phase 6.
//! Resolves from_role and to_role to models from roles.toml, runs A on input then B on bridge, returns content.
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use std::path::Path;

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

fn fused_impl(
    from_path: &str,
    to_path: &str,
    input: &str,
) -> Result<String, String> {
    #[cfg(feature = "candle")]
    {
        let mut engine = crate::inference::engine::InferenceEngine::new();
        engine.load_model(Path::new(from_path))?;
        let bridge = engine.generate(input, 512, 0.7)?.join("");
        engine.load_model(Path::new(to_path))?;
        let prompt = format!(
            "Context from previous agent:\n\n{}\n\nRespond concisely:",
            bridge
        );
        let content = engine.generate(&prompt, 512, 0.7)?.join("");
        Ok(content)
    }
    #[cfg(not(feature = "candle"))]
    {
        let _ = (from_path, to_path, input);
        Err("fused requires --features candle".to_string())
    }
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
    match fused_impl(from_path, to_path, &body.input) {
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
