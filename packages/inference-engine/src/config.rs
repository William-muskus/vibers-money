//! Load roles.toml for model list and Phase 4 defaults (draft_model, draft_tokens).
use std::collections::HashMap;
use std::path::Path;
use toml::Value;

/// Parsed roles config (minimal for now; extend for Phase 4).
#[derive(Debug, Default, Clone)]
pub struct RolesConfig {
    pub model_ids: Vec<String>,
    /// Path to draft model for speculative decoding (from [defaults].draft_model).
    pub draft_model: Option<String>,
    /// Number of draft tokens per round (from [defaults].draft_tokens).
    pub draft_tokens: Option<usize>,
    /// Role name -> model path (from [roles.<name>].model).
    pub role_models: HashMap<String, String>,
}

/// Shared app state for axum (so api layer can use it without depending on server).
#[derive(Clone)]
pub struct AppState {
    pub roles_config: RolesConfig,
    #[cfg(feature = "candle")]
    pub inference_engine: Option<std::sync::Arc<std::sync::Mutex<crate::inference::engine::InferenceEngine>>>,
    #[cfg(feature = "candle")]
    pub fused_engine: Option<std::sync::Arc<std::sync::Mutex<FusedEngineState>>>,
}

/// State for the fused endpoint: one engine reused across requests; loaded_path tracks which model is currently loaded.
#[cfg(feature = "candle")]
#[derive(Default)]
pub struct FusedEngineState {
    pub engine: crate::inference::engine::InferenceEngine,
    pub loaded_path: Option<String>,
}

/// Load config from path. Returns default (empty model_ids) if file missing or invalid.
pub fn load_roles_config(path: &Path) -> RolesConfig {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return RolesConfig::default(),
    };
    let value: Value = match content.parse() {
        Ok(v) => v,
        Err(_) => return RolesConfig::default(),
    };
    let mut model_ids = Vec::new();
    if let Some(roles) = value.get("roles").and_then(|r| r.as_table()) {
        for (_role, tbl) in roles {
            if let Some(model) = tbl.get("model").and_then(|m| m.as_str()) {
                if !model_ids.contains(&model.to_string()) {
                    model_ids.push(model.to_string());
                }
            }
        }
    }
    if model_ids.is_empty() {
        if let Some(defaults) = value.get("defaults").and_then(|d| d.as_table()) {
            if let Some(model) = defaults
                .get("model")
                .or_else(|| defaults.get("draft_model"))
                .and_then(|m| m.as_str())
            {
                model_ids.push(model.to_string());
            }
        }
    }
    let draft_model = value
        .get("defaults")
        .and_then(|d| d.get("draft_model"))
        .and_then(|m| m.as_str())
        .map(String::from);
    let draft_tokens = value
        .get("defaults")
        .and_then(|d| d.get("draft_tokens"))
        .and_then(|v| v.as_integer())
        .map(|n| n as usize);
    let mut role_models = HashMap::new();
    if let Some(roles) = value.get("roles").and_then(|r| r.as_table()) {
        for (role_name, tbl) in roles {
            if let Some(model) = tbl.get("model").and_then(|m| m.as_str()) {
                role_models.insert(role_name.clone(), model.to_string());
            }
        }
    }
    RolesConfig {
        model_ids,
        draft_model,
        draft_tokens,
        role_models,
    }
}
