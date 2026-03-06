//! Inference pipeline: engine, sampling, speculative decoding (Phase 4), constrained decoding (Phase 5).
//! With `candle` feature: real GGUF load + inference loop; otherwise stubs.

pub mod constrained;
pub mod engine;
#[cfg(feature = "candle")]
pub mod loader;
pub mod sampling;
pub mod speculative;
