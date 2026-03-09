//! Phase 4: Speculative decoding — draft model proposes tokens, main model verifies.
//!
//! Speculative decoding is implemented on `crate::inference::engine::InferenceEngine::generate_speculative`.
//! This module holds `SpeculativeConfig` for config parsing (e.g. from roles.toml [defaults] draft_model, draft_tokens).
#![allow(dead_code)]

pub struct SpeculativeConfig {
    pub draft_model: String,
    pub draft_tokens: usize,
    pub adaptive_draft: bool,
}

impl SpeculativeConfig {
    pub fn from_roles(draft_model: Option<&str>, draft_tokens: Option<usize>) -> Option<Self> {
        let draft_model = draft_model?.to_string();
        let draft_tokens = draft_tokens.unwrap_or(4);
        Some(Self {
            draft_model,
            draft_tokens,
            adaptive_draft: false,
        })
    }
}
