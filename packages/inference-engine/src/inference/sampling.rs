//! Temperature and top-p sampling over logits. With `candle` feature: real sampling; otherwise stub.
#![allow(dead_code)]

#[cfg(feature = "candle")]
use candle_core::{DType, Result, Tensor};

/// Apply temperature to logits and sample next token index.
/// Without candle: returns 0 (stub). With candle: softmax(logits/temp) and sample.
#[cfg(not(feature = "candle"))]
pub fn apply_temperature(_logits: &[f32], _temperature: f32) -> Vec<f32> {
    vec![]
}

#[cfg(not(feature = "candle"))]
pub fn sample_next_token(_logits: &[f32], _temperature: f32, _top_p: Option<f32>) -> usize {
    0
}

#[cfg(feature = "candle")]
pub fn sample_next_token_from_tensor(
    logits: &Tensor,
    temperature: f32,
    top_p: Option<f32>,
    rng: &mut dyn rand::RngCore,
) -> Result<u32> {
    use candle_nn::ops::softmax_last_dim;
    let logits = logits.to_dtype(DType::F32)?;
    let logits = if temperature > 0.0 && temperature.is_finite() {
        let inv_t = 1.0 / temperature as f64;
        (inv_t * logits)?
    } else {
        logits
    };
    let probs = softmax_last_dim(&logits)?;
    let probs_v: Vec<f32> = probs.to_vec1()?;
    let idx = sample_from_probs(&probs_v, top_p, rng);
    Ok(idx as u32)
}

/// Sample from logits after masking: only token ids in `allowed` are considered; others are treated as -inf.
#[cfg(feature = "candle")]
pub fn sample_next_token_masked(
    logits: &Tensor,
    allowed: &std::collections::HashSet<u32>,
    temperature: f32,
    rng: &mut dyn rand::RngCore,
) -> Result<u32> {
    let logits = logits.to_dtype(DType::F32)?;
    let logits_v: Vec<f32> = logits.to_vec1()?;
    let masked: Vec<f32> = logits_v
        .iter()
        .enumerate()
        .map(|(i, &v)| {
            if allowed.contains(&(i as u32)) {
                if temperature > 0.0 && temperature.is_finite() {
                    v / temperature
                } else {
                    v
                }
            } else {
                f32::NEG_INFINITY
            }
        })
        .collect();
    let max_m = masked.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    if max_m == f32::NEG_INFINITY {
        return Ok(*allowed.iter().next().unwrap_or(&0));
    }
    let sum: f32 = masked.iter().map(|&x| (x - max_m).exp()).sum();
    let probs: Vec<f32> = masked.iter().map(|&x| (x - max_m).exp() / sum).collect();
    let idx = sample_from_probs(&probs, None, rng);
    Ok(idx as u32)
}

#[cfg(feature = "candle")]
fn sample_from_probs(probs: &[f32], top_p: Option<f32>, rng: &mut dyn rand::RngCore) -> usize {
    use rand::Rng;
    let mut indices: Vec<usize> = (0..probs.len()).collect();
    indices.sort_by(|&a, &b| probs[b].partial_cmp(&probs[a]).unwrap_or(std::cmp::Ordering::Equal));
    let (sampling_probs, sampling_indices) = if let Some(p) = top_p {
        let mut cum = 0f32;
        let mut take = Vec::new();
        for &i in &indices {
            if cum >= p {
                break;
            }
            cum += probs[i];
            take.push(i);
        }
        if take.is_empty() {
            take.push(indices[0]);
        }
        let sum: f32 = take.iter().map(|&i| probs[i]).sum();
        let probs_take: Vec<f32> = take.iter().map(|&i| probs[i] / sum).collect();
        (probs_take, take)
    } else {
        (indices.iter().map(|&i| probs[i]).collect(), indices)
    };
    let r: f32 = rng.gen();
    let mut acc = 0f32;
    for (k, &idx) in sampling_indices.iter().enumerate() {
        acc += sampling_probs[k];
        if r <= acc {
            return idx;
        }
    }
    sampling_indices[sampling_indices.len() - 1]
}
