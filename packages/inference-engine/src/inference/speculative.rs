//! Phase 4: Speculative decoding — draft model proposes tokens, main model verifies.
//! Config: roles.toml [defaults] draft_model, draft_tokens.
//! When candle is on and config has draft_model, decode_speculative can be used; for now
//! we fall back to single-model generate until two-model verify loop is wired in the engine.
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

/// Speculative decode: when candle is on and two models are available, draft proposes then main verifies.
/// Fallback: returns Ok(vec![]) so caller uses single-model generate.
#[cfg(not(feature = "candle"))]
pub fn decode_speculative(
    _prompt: &str,
    _config: &SpeculativeConfig,
    _max_tokens: u32,
    _temperature: f32,
) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[cfg(feature = "candle")]
pub fn decode_speculative(
    prompt: &str,
    config: &SpeculativeConfig,
    max_tokens: u32,
    temperature: f32,
) -> Result<Vec<String>, String> {
    // Full speculative: would run draft to get config.draft_tokens, then main forward on
    // prompt+draft to verify, accept longest prefix match, sample one from main, repeat.
    // Requires engine to expose forward_logits(seq) and draft generate. For now fallback to
    // single-model path (caller should use engine.generate when speculative returns empty).
    let _ = (prompt, config, max_tokens, temperature);
    Ok(vec![])
}
