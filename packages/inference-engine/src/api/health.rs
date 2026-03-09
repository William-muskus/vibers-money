//! GET /health — server and model-loaded status for orchestrator health check.
use axum::{extract::State, response::IntoResponse, Json};
use serde::Serialize;

use crate::config::AppState;

#[derive(Serialize)]
pub struct HealthResponse {
    pub ok: bool,
    pub model_loaded: bool,
}

pub async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let model_loaded = {
        #[cfg(feature = "candle")]
        {
            state
                .inference_engine
                .as_ref()
                .and_then(|e| e.lock().ok())
                .map(|g| g.has_model())
                .unwrap_or(false)
        }
        #[cfg(not(feature = "candle"))]
        {
            let _ = state;
            false
        }
    };
    Json(HealthResponse {
        ok: true,
        model_loaded,
    })
}
