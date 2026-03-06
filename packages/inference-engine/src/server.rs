//! Axum app: /v1/models, /v1/chat/completions, /v1/fused (stub).
use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};
use tower_http::cors::CorsLayer;

use crate::api::{chat, fused, models};
use crate::config::{AppState, RolesConfig};

const BODY_LIMIT_MB: usize = 2;
const BODY_LIMIT_BYTES: usize = BODY_LIMIT_MB * 1024 * 1024;

fn cors_layer() -> CorsLayer {
    if let Ok(origin) = std::env::var("CORS_ORIGIN") {
        let origin = origin.trim();
        if origin.is_empty() {
            return CorsLayer::permissive();
        }
        if let Ok(origin) = origin.parse::<axum::http::HeaderValue>() {
            return CorsLayer::new()
                .allow_origin(origin)
                .allow_methods(tower_http::cors::AllowMethods::any())
                .allow_headers(tower_http::cors::AllowHeaders::any());
        }
    }
    CorsLayer::permissive()
}

pub fn app(roles_config: RolesConfig) -> Router {
    let state = AppState {
        roles_config,
        #[cfg(feature = "candle")]
        inference_engine: crate::inference::engine::init_engine_for_app(),
    };
    Router::new()
        .route("/v1/models", get(models::get_models))
        .route("/v1/chat/completions", post(chat::chat_completions))
        .route("/v1/fused", post(fused::fused))
        .layer(DefaultBodyLimit::max(BODY_LIMIT_BYTES))
        .layer(cors_layer())
        .with_state(state)
}
