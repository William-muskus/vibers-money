//! Core inference loop. With `candle` feature: load GGUF, run forward + sampling. Otherwise stub.
#![allow(dead_code)]

#[cfg(not(feature = "candle"))]
pub struct InferenceEngine;

#[cfg(not(feature = "candle"))]
impl InferenceEngine {
    pub fn new() -> Self {
        Self
    }
    pub fn load_model(&mut self, _path: &str) -> Result<(), String> {
        Ok(())
    }
    pub fn generate(
        &self,
        _prompt: &str,
        _max_tokens: u32,
        _temperature: f32,
    ) -> Result<Vec<String>, String> {
        Ok(vec![])
    }
}

#[cfg(feature = "candle")]
use crate::inference::loader;
#[cfg(feature = "candle")]
use crate::inference::sampling;
#[cfg(feature = "candle")]
use candle_core::Tensor;
#[cfg(feature = "candle")]
use candle_transformers::models::quantized_llama as qllama;
#[cfg(feature = "candle")]
use rand::SeedableRng;
#[cfg(feature = "candle")]
use std::collections::HashSet;
#[cfg(feature = "candle")]
use std::path::{Path, PathBuf};
#[cfg(feature = "candle")]
use std::sync::Arc;
#[cfg(feature = "candle")]
use crate::inference::constrained;

#[cfg(feature = "candle")]
pub struct InferenceEngine {
    model: Option<Arc<loader::LoadedModel>>,
    draft_model: Option<Arc<loader::LoadedModel>>,
    use_cuda: bool,
}

#[cfg(feature = "candle")]
impl InferenceEngine {
    pub fn new() -> Self {
        // When built with cuda: use GPU by default; set VIBERS_INFERENCE_CPU=1 to force CPU.
        // When built without cuda: use GPU only if CUDA_VISIBLE_DEVICES or VIBERS_INFERENCE_CUDA=1 (no-op, CPU used).
        let use_cuda = {
            #[cfg(feature = "cuda")]
            {
                std::env::var("VIBERS_INFERENCE_CPU").as_deref() != Ok("1")
            }
            #[cfg(not(feature = "cuda"))]
            {
                std::env::var("CUDA_VISIBLE_DEVICES").is_ok()
                    || std::env::var("VIBERS_INFERENCE_CUDA").as_deref() == Ok("1")
            }
        };
        Self {
            model: None,
            draft_model: None,
            use_cuda,
        }
    }

    pub fn load_model(&mut self, path: &Path) -> Result<(), String> {
        let tokenizer_path = std::env::var("VIBERS_TOKENIZER_PATH")
            .ok()
            .map(|p| Path::new(&p).to_path_buf());
        let model = loader::load_gguf_llama(
            path,
            tokenizer_path.as_deref(),
            self.use_cuda,
        )?;
        self.model = Some(Arc::new(model));
        Ok(())
    }

    pub fn load_draft_model(&mut self, path: &Path) -> Result<(), String> {
        let tokenizer_path = std::env::var("VIBERS_TOKENIZER_PATH")
            .ok()
            .map(|p| Path::new(&p).to_path_buf());
        let model = loader::load_gguf_llama(
            path,
            tokenizer_path.as_deref(),
            self.use_cuda,
        )?;
        self.draft_model = Some(Arc::new(model));
        Ok(())
    }

    /// Run forward on full sequence and return logits for every position (seq_len, vocab).
    fn forward_full_logits(
        weights: &mut qllama::ModelWeights,
        device: &candle_core::Device,
        tokens: &[u32],
    ) -> Result<Tensor, String> {
        if tokens.is_empty() {
            return Err("empty tokens".to_string());
        }
        let input = Tensor::new(tokens, device).map_err(|e| e.to_string())?;
        let logits = weights.forward(&input, 0).map_err(|e| e.to_string())?;
        logits.squeeze(0).map_err(|e| e.to_string())
    }

    /// Returns true if current output ends with any of the stop strings (trimmed comparison).
    fn output_ends_with_stop(current: &str, stop: Option<&[String]>) -> bool {
        let stop = match stop {
            Some(s) if !s.is_empty() => s,
            _ => return false,
        };
        let trimmed = current.trim_end();
        stop.iter().any(|s| {
            let t = s.trim();
            !t.is_empty() && trimmed.ends_with(t)
        })
    }

    /// Sample one token from a model given current tokens and index.
    fn next_token_from_model(
        model: &loader::LoadedModel,
        tokens: &[u32],
        index_pos: usize,
        temperature: f32,
        rng: &mut rand::rngs::StdRng,
    ) -> Result<u32, String> {
        let mut weights = model.weights.lock().map_err(|e| e.to_string())?;
        let (context_size, ctx_index) = if index_pos == 0 {
            (tokens.len(), 0)
        } else {
            (1, index_pos)
        };
        let start = tokens.len().saturating_sub(context_size);
        let ctxt: Vec<u32> = tokens[start..].to_vec();
        let input = Tensor::new(ctxt.as_slice(), &model.device).map_err(|e| e.to_string())?;
        let logits = weights.forward(&input, ctx_index).map_err(|e| e.to_string())?;
        let logits = logits.squeeze(0).map_err(|e| e.to_string())?;
        sampling::sample_next_token_from_tensor(&logits, temperature, None, rng).map_err(|e| e.to_string())
    }

    /// Return logits row for the next token at the given position (same forward as next_token_from_model, no sampling).
    fn get_logits_at(
        model: &loader::LoadedModel,
        tokens: &[u32],
        index_pos: usize,
    ) -> Result<Tensor, String> {
        let mut weights = model.weights.lock().map_err(|e| e.to_string())?;
        let (context_size, ctx_index) = if index_pos == 0 {
            (tokens.len(), 0)
        } else {
            (1, index_pos)
        };
        let start = tokens.len().saturating_sub(context_size);
        let ctxt: Vec<u32> = tokens[start..].to_vec();
        let input = Tensor::new(ctxt.as_slice(), &model.device).map_err(|e| e.to_string())?;
        let logits = weights.forward(&input, ctx_index).map_err(|e| e.to_string())?;
        logits.squeeze(0).map_err(|e| e.to_string())
    }

    /// Build set of token IDs that extend current_text to a valid tool-call prefix (top-K by logits, filter by grammar).
    /// Falls back to all top-K if none pass, to avoid deadlock.
    fn allowed_ids_for_tool_call_prefix(
        current_text: &str,
        tokenizer: &tokenizers::Tokenizer,
        logits: &Tensor,
        allowed_names: &[String],
        top_k: usize,
    ) -> HashSet<u32> {
        let logits_v: Vec<f32> = match logits.to_vec1() {
            Ok(v) => v,
            Err(_) => return HashSet::new(),
        };
        let mut indices: Vec<usize> = (0..logits_v.len()).collect();
        indices.sort_by(|&a, &b| {
            logits_v[b]
                .partial_cmp(&logits_v[a])
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let mut allowed = HashSet::new();
        for id in indices.iter().take(top_k).copied() {
            let id_u = id as u32;
            if let Ok(tok_str) = tokenizer.decode(&[id_u], false) {
                if constrained::is_valid_tool_call_prefix(
                    &format!("{}{}", current_text, tok_str),
                    allowed_names,
                ) {
                    allowed.insert(id_u);
                }
            }
        }
        if allowed.is_empty() {
            for id in indices.into_iter().take(top_k) {
                allowed.insert(id as u32);
            }
        }
        allowed
    }

    pub fn generate(
        &self,
        prompt: &str,
        max_tokens: u32,
        temperature: f32,
        stop: Option<&[String]>,
    ) -> Result<Vec<String>, String> {
        let model = self
            .model
            .as_ref()
            .ok_or_else(|| "no model loaded; set MODEL_PATH and call load_model".to_string())?;
        let mut weights = model.weights.lock().map_err(|e| e.to_string())?;
        let encoded = model
            .tokenizer
            .encode(prompt, true)
            .map_err(|e| e.to_string())?;
        let mut tokens: Vec<u32> = encoded.get_ids().to_vec();
        let max_tokens = max_tokens.min(2048) as usize;
        let mut rng = rand::rngs::StdRng::from_entropy();
        let top_p = None::<f32>;
        let mut output_strings = Vec::new();
        let mut index_pos = 0usize;
        let mut current_text = String::new();

        for _ in 0..max_tokens {
            let (context_size, ctx_index) = if index_pos == 0 {
                (tokens.len(), 0)
            } else {
                (1, index_pos)
            };
            let start = tokens.len().saturating_sub(context_size);
            let ctxt: Vec<u32> = tokens[start..].to_vec();
            let input =
                Tensor::new(ctxt.as_slice(), &model.device).map_err(|e| e.to_string())?;
            let logits = weights
                .forward(&input, ctx_index)
                .map_err(|e| e.to_string())?;
            let logits = logits.squeeze(0).map_err(|e| e.to_string())?;
            let next_token = sampling::sample_next_token_from_tensor(
                &logits,
                temperature,
                top_p,
                &mut rng,
            )
            .map_err(|e| e.to_string())?;
            index_pos += ctxt.len();
            tokens.push(next_token);

            if model.eos_token_id == Some(next_token) {
                break;
            }
            if let Ok(decoded) = model.tokenizer.decode(&[next_token], false) {
                if !decoded.is_empty() {
                    current_text.push_str(&decoded);
                    if Self::output_ends_with_stop(&current_text, stop) {
                        break;
                    }
                    output_strings.push(decoded);
                }
            }
        }

        Ok(output_strings)
    }

    /// Generate tokens and call `callback` for each decoded token string (for streaming).
    pub fn generate_stream_callback<F>(
        &self,
        prompt: &str,
        max_tokens: u32,
        temperature: f32,
        stop: Option<&[String]>,
        mut callback: F,
    ) -> Result<(), String>
    where
        F: FnMut(String),
    {
        let model = self
            .model
            .as_ref()
            .ok_or_else(|| "no model loaded".to_string())?;
        let mut weights = model.weights.lock().map_err(|e| e.to_string())?;
        let encoded = model.tokenizer.encode(prompt, true).map_err(|e| e.to_string())?;
        let mut tokens: Vec<u32> = encoded.get_ids().to_vec();
        let max_tokens = max_tokens.min(2048) as usize;
        let mut rng = rand::rngs::StdRng::from_entropy();
        let top_p: Option<f32> = None;
        let mut index_pos = 0usize;
        let mut current_text = String::new();

        for _ in 0..max_tokens {
            let (context_size, ctx_index) = if index_pos == 0 {
                (tokens.len(), 0)
            } else {
                (1, index_pos)
            };
            let start = tokens.len().saturating_sub(context_size);
            let ctxt: Vec<u32> = tokens[start..].to_vec();
            let input =
                Tensor::new(ctxt.as_slice(), &model.device).map_err(|e| e.to_string())?;
            let logits = weights
                .forward(&input, ctx_index)
                .map_err(|e| e.to_string())?;
            let logits = logits.squeeze(0).map_err(|e| e.to_string())?;
            let next_token = sampling::sample_next_token_from_tensor(
                &logits,
                temperature,
                top_p,
                &mut rng,
            )
            .map_err(|e| e.to_string())?;
            index_pos += ctxt.len();
            tokens.push(next_token);

            if model.eos_token_id == Some(next_token) {
                break;
            }
            if let Ok(decoded) = model.tokenizer.decode(&[next_token], false) {
                if !decoded.is_empty() {
                    current_text.push_str(&decoded);
                    if Self::output_ends_with_stop(&current_text, stop) {
                        break;
                    }
                    callback(decoded);
                }
            }
        }
        Ok(())
    }

    /// Returns true if a draft model is loaded for speculative decoding.
    pub fn has_draft_model(&self) -> bool {
        self.draft_model.is_some()
    }

    /// Generate with token-level JSON constraint: only tokens that extend current text to a valid JSON object prefix are allowed.
    pub fn generate_constrained_json(
        &self,
        prompt: &str,
        max_tokens: u32,
        temperature: f32,
        stop: Option<&[String]>,
    ) -> Result<Vec<String>, String> {
        const TOP_K_CONSTRAIN: usize = 512;
        let model = self.model.as_ref().ok_or_else(|| "no model loaded".to_string())?;
        let mut weights = model.weights.lock().map_err(|e| e.to_string())?;
        let encoded = model.tokenizer.encode(prompt, true).map_err(|e| e.to_string())?;
        let mut tokens: Vec<u32> = encoded.get_ids().to_vec();
        let max_tokens = max_tokens.min(2048) as usize;
        let mut rng = rand::rngs::StdRng::from_entropy();
        let mut output_strings = Vec::new();
        let mut index_pos = 0usize;
        let mut current_text = String::new();

        for _ in 0..max_tokens {
            let (context_size, ctx_index) = if index_pos == 0 {
                (tokens.len(), 0)
            } else {
                (1, index_pos)
            };
            let start = tokens.len().saturating_sub(context_size);
            let ctxt: Vec<u32> = tokens[start..].to_vec();
            let input =
                Tensor::new(ctxt.as_slice(), &model.device).map_err(|e| e.to_string())?;
            let logits = weights.forward(&input, ctx_index).map_err(|e| e.to_string())?;
            let logits = logits.squeeze(0).map_err(|e| e.to_string())?;
            let logits_v: Vec<f32> = logits.to_vec1().map_err(|e| e.to_string())?;
            let mut indices: Vec<usize> = (0..logits_v.len()).collect();
            indices.sort_by(|&a, &b| {
                logits_v[b]
                    .partial_cmp(&logits_v[a])
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            let top_k = indices.iter().take(TOP_K_CONSTRAIN).copied();
            let mut allowed = HashSet::new();
            for id in top_k {
                let id_u = id as u32;
                if let Ok(tok_str) = model.tokenizer.decode(&[id_u], false) {
                    if constrained::is_valid_json_object_prefix(&format!("{}{}", current_text, tok_str)) {
                        allowed.insert(id_u);
                    }
                }
            }
            if allowed.is_empty() {
                for id in indices.into_iter().take(TOP_K_CONSTRAIN) {
                    allowed.insert(id as u32);
                }
            }
            let next_token = sampling::sample_next_token_masked(
                &logits,
                &allowed,
                temperature,
                &mut rng,
            )
            .map_err(|e| e.to_string())?;
            index_pos += ctxt.len();
            tokens.push(next_token);

            if model.eos_token_id == Some(next_token) {
                break;
            }
            if let Ok(decoded) = model.tokenizer.decode(&[next_token], false) {
                if !decoded.is_empty() {
                    current_text.push_str(&decoded);
                    output_strings.push(decoded);
                    if Self::output_ends_with_stop(&current_text, stop) {
                        break;
                    }
                }
            }
        }

        Ok(output_strings)
    }

    /// Generate with token-level tool-call constraint: only tokens that extend current text to a valid tool-call prefix are allowed.
    pub fn generate_constrained_tool_call(
        &self,
        prompt: &str,
        allowed_tool_names: &[String],
        max_tokens: u32,
        temperature: f32,
        stop: Option<&[String]>,
    ) -> Result<Vec<String>, String> {
        const TOP_K_CONSTRAIN: usize = 512;
        let model = self.model.as_ref().ok_or_else(|| "no model loaded".to_string())?;
        let mut weights = model.weights.lock().map_err(|e| e.to_string())?;
        let encoded = model.tokenizer.encode(prompt, true).map_err(|e| e.to_string())?;
        let mut tokens: Vec<u32> = encoded.get_ids().to_vec();
        let max_tokens = max_tokens.min(2048) as usize;
        let mut rng = rand::rngs::StdRng::from_entropy();
        let mut output_strings = Vec::new();
        let mut index_pos = 0usize;
        let mut current_text = String::new();

        for _ in 0..max_tokens {
            let (context_size, ctx_index) = if index_pos == 0 {
                (tokens.len(), 0)
            } else {
                (1, index_pos)
            };
            let start = tokens.len().saturating_sub(context_size);
            let ctxt: Vec<u32> = tokens[start..].to_vec();
            let input =
                Tensor::new(ctxt.as_slice(), &model.device).map_err(|e| e.to_string())?;
            let logits = weights.forward(&input, ctx_index).map_err(|e| e.to_string())?;
            let logits = logits.squeeze(0).map_err(|e| e.to_string())?;
            let allowed = Self::allowed_ids_for_tool_call_prefix(
                &current_text,
                &model.tokenizer,
                &logits,
                allowed_tool_names,
                TOP_K_CONSTRAIN,
            );
            let next_token = sampling::sample_next_token_masked(
                &logits,
                &allowed,
                temperature,
                &mut rng,
            )
            .map_err(|e| e.to_string())?;
            index_pos += ctxt.len();
            tokens.push(next_token);

            if model.eos_token_id == Some(next_token) {
                break;
            }
            if let Ok(decoded) = model.tokenizer.decode(&[next_token], false) {
                if !decoded.is_empty() {
                    current_text.push_str(&decoded);
                    output_strings.push(decoded);
                    if Self::output_ends_with_stop(&current_text, stop) {
                        break;
                    }
                }
            }
        }

        Ok(output_strings)
    }

    /// Speculative decoding: draft proposes K tokens, main verifies in one forward, accept longest prefix, sample one from main, repeat.
    pub fn generate_speculative(
        &self,
        prompt: &str,
        draft_tokens_k: usize,
        max_tokens: u32,
        temperature: f32,
        stop: Option<&[String]>,
    ) -> Result<Vec<String>, String> {
        let main = self.model.as_ref().ok_or_else(|| "no main model".to_string())?;
        let draft = self.draft_model.as_ref().ok_or_else(|| "no draft model".to_string())?;
        let mut main_weights = main.weights.lock().map_err(|e| e.to_string())?;
        let encoded = main.tokenizer.encode(prompt, true).map_err(|e| e.to_string())?;
        let mut tokens: Vec<u32> = encoded.get_ids().to_vec();
        let max_tokens = max_tokens.min(2048) as usize;
        let k = draft_tokens_k.min(16).max(1);
        let mut rng = rand::rngs::StdRng::from_entropy();
        let mut output_strings = Vec::new();
        let mut total_generated = 0usize;
        let mut current_text = String::new();

        while total_generated < max_tokens {
            // Draft phase: propose K tokens (draft_seq = tokens + draft_tokens, do not mutate tokens yet)
            let mut draft_seq = tokens.clone();
            let mut draft_proposals = Vec::with_capacity(k);
            let mut index_pos = tokens.len();
            for _ in 0..k {
                let next = Self::next_token_from_model(draft, &draft_seq, index_pos, temperature, &mut rng)?;
                if main.eos_token_id == Some(next) {
                    break;
                }
                draft_seq.push(next);
                draft_proposals.push(next);
                index_pos += 1;
            }
            if draft_proposals.is_empty() {
                break;
            }

            // Main verify: run main on full_seq = tokens + draft_proposals, get logits at positions tokens.len()..tokens.len()+draft_proposals.len()
            let full_seq: Vec<u32> = tokens.iter().chain(draft_proposals.iter()).copied().collect();
            let logits = Self::forward_full_logits(&mut main_weights, &main.device, &full_seq)?;
            let seq_len = full_seq.len();
            let prompt_len = tokens.len();
            let n_proposed = draft_proposals.len();

            // Accept longest prefix where main's argmax matches draft
            let mut n_accept = 0usize;
            for i in 0..n_proposed {
                let row = logits.get(prompt_len + i).map_err(|e| e.to_string())?;
                let argmax = row.argmax(0).map_err(|e| e.to_string())?;
                let pred: u32 = argmax.to_vec0::<u32>().map_err(|e| e.to_string())?;
                if pred == draft_proposals[i] {
                    n_accept = i + 1;
                } else {
                    break;
                }
            }

            // New tokens: accepted draft prefix + one sampled from main at position prompt_len + n_accept
            let mut new_token_ids = draft_proposals[..n_accept].to_vec();
            let sample_pos = prompt_len + n_accept;
            let one_more = if sample_pos < seq_len {
                let row = logits.get(sample_pos).map_err(|e| e.to_string())?;
                sampling::sample_next_token_from_tensor(&row, temperature, None, &mut rng).map_err(|e| e.to_string())?
            } else {
                drop(main_weights);
                let next = Self::next_token_from_model(main, &full_seq, sample_pos, temperature, &mut rng)?;
                main_weights = main.weights.lock().map_err(|e| e.to_string())?;
                next
            };
            new_token_ids.push(one_more);

            for &tid in &new_token_ids {
                if let Ok(s) = main.tokenizer.decode(&[tid], false) {
                    if !s.is_empty() {
                        current_text.push_str(&s);
                        output_strings.push(s);
                    }
                }
            }
            total_generated += new_token_ids.len();
            tokens.extend(new_token_ids);

            if Self::output_ends_with_stop(&current_text, stop) {
                break;
            }
            if main.eos_token_id == Some(one_more) {
                break;
            }
        }

        Ok(output_strings)
    }

    /// Speculative decoding with tool-call grammar: draft and main both constrained to valid tool-call prefix.
    pub fn generate_speculative_tool_call(
        &self,
        prompt: &str,
        draft_tokens_k: usize,
        max_tokens: u32,
        temperature: f32,
        stop: Option<&[String]>,
        allowed_tool_names: &[String],
    ) -> Result<Vec<String>, String> {
        const TOP_K_CONSTRAIN: usize = 512;
        let main = self.model.as_ref().ok_or_else(|| "no main model".to_string())?;
        let draft = self.draft_model.as_ref().ok_or_else(|| "no draft model".to_string())?;
        let mut main_weights = main.weights.lock().map_err(|e| e.to_string())?;
        let encoded = main.tokenizer.encode(prompt, true).map_err(|e| e.to_string())?;
        let mut tokens: Vec<u32> = encoded.get_ids().to_vec();
        let max_tokens = max_tokens.min(2048) as usize;
        let k = draft_tokens_k.min(16).max(1);
        let mut rng = rand::rngs::StdRng::from_entropy();
        let mut output_strings = Vec::new();
        let mut total_generated = 0usize;
        let mut current_text = String::new();

        while total_generated < max_tokens {
            let current_text_before_draft = current_text.clone();
            let mut draft_seq = tokens.clone();
            let mut draft_proposals = Vec::with_capacity(k);
            let mut draft_current_text = current_text_before_draft.clone();
            let mut index_pos = tokens.len();

            for _ in 0..k {
                let logits = Self::get_logits_at(draft, &draft_seq, index_pos)?;
                let allowed = Self::allowed_ids_for_tool_call_prefix(
                    &draft_current_text,
                    &main.tokenizer,
                    &logits,
                    allowed_tool_names,
                    TOP_K_CONSTRAIN,
                );
                let next = sampling::sample_next_token_masked(
                    &logits,
                    &allowed,
                    temperature,
                    &mut rng,
                )
                .map_err(|e| e.to_string())?;
                if main.eos_token_id == Some(next) {
                    break;
                }
                draft_seq.push(next);
                draft_proposals.push(next);
                index_pos += 1;
                if let Ok(s) = main.tokenizer.decode(&[next], false) {
                    if !s.is_empty() {
                        draft_current_text.push_str(&s);
                    }
                }
            }

            if draft_proposals.is_empty() {
                break;
            }

            let full_seq: Vec<u32> =
                tokens.iter().chain(draft_proposals.iter()).copied().collect();
            let logits = Self::forward_full_logits(&mut main_weights, &main.device, &full_seq)?;
            let seq_len = full_seq.len();
            let prompt_len = tokens.len();
            let n_proposed = draft_proposals.len();

            let mut n_accept = 0usize;
            for i in 0..n_proposed {
                let prefix: Vec<u32> = draft_proposals[0..i].to_vec();
                let text_i = if prefix.is_empty() {
                    current_text_before_draft.clone()
                } else {
                    format!(
                        "{}{}",
                        current_text_before_draft,
                        main.tokenizer
                            .decode(&prefix, false)
                            .unwrap_or_default()
                    )
                };
                let row = logits.get(prompt_len + i).map_err(|e| e.to_string())?;
                let allowed = Self::allowed_ids_for_tool_call_prefix(
                    &text_i,
                    &main.tokenizer,
                    &row,
                    allowed_tool_names,
                    TOP_K_CONSTRAIN,
                );
                if allowed.contains(&draft_proposals[i]) {
                    n_accept = i + 1;
                } else {
                    break;
                }
            }

            current_text = if n_accept == 0 {
                current_text_before_draft
            } else {
                format!(
                    "{}{}",
                    current_text_before_draft,
                    main.tokenizer
                        .decode(&draft_proposals[0..n_accept], false)
                        .unwrap_or_default()
                )
            };

            let mut new_token_ids = draft_proposals[..n_accept].to_vec();
            let sample_pos = prompt_len + n_accept;
            let one_more = if sample_pos < seq_len {
                let row = logits.get(sample_pos).map_err(|e| e.to_string())?;
                let allowed = Self::allowed_ids_for_tool_call_prefix(
                    &current_text,
                    &main.tokenizer,
                    &row,
                    allowed_tool_names,
                    TOP_K_CONSTRAIN,
                );
                sampling::sample_next_token_masked(&row, &allowed, temperature, &mut rng)
                    .map_err(|e| e.to_string())?
            } else {
                drop(main_weights);
                let logits = Self::get_logits_at(main, &full_seq, sample_pos)?;
                let allowed = Self::allowed_ids_for_tool_call_prefix(
                    &current_text,
                    &main.tokenizer,
                    &logits,
                    allowed_tool_names,
                    TOP_K_CONSTRAIN,
                );
                let next = sampling::sample_next_token_masked(
                    &logits,
                    &allowed,
                    temperature,
                    &mut rng,
                )
                .map_err(|e| e.to_string())?;
                main_weights = main.weights.lock().map_err(|e| e.to_string())?;
                next
            };
            new_token_ids.push(one_more);

            for &tid in &new_token_ids {
                if let Ok(s) = main.tokenizer.decode(&[tid], false) {
                    if !s.is_empty() {
                        current_text.push_str(&s);
                        output_strings.push(s);
                    }
                }
            }
            total_generated += new_token_ids.len();
            tokens.extend(new_token_ids);

            if Self::output_ends_with_stop(&current_text, stop) {
                break;
            }
            if main.eos_token_id == Some(one_more) {
                break;
            }
        }

        Ok(output_strings)
    }
}

#[cfg(feature = "candle")]
impl InferenceEngine {
    /// Returns true if a model is loaded and generate can be called.
    pub fn has_model(&self) -> bool {
        self.model.is_some()
    }
}

#[cfg(feature = "candle")]
impl Default for InferenceEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Resolve MODEL_PATH to an absolute path. Tries cwd-relative first; if not found and path is relative,
/// tries packages/inference-engine/ + path (for npm run from repo root).
/// Normalizes separators (e.g. forward slashes → backslashes on Windows) so File::open works.
#[cfg(feature = "candle")]
pub fn resolve_model_path(path: &str) -> PathBuf {
    let p = Path::new(path);
    let resolved = if !p.is_relative() {
        p.to_path_buf()
    } else if let Ok(cwd) = std::env::current_dir() {
        let candidate = cwd.join(p);
        if candidate.exists() {
            candidate
        } else {
            let fallback = cwd.join("packages").join("inference-engine").join(p);
            if fallback.exists() {
                fallback
            } else {
                p.to_path_buf()
            }
        }
    } else {
        p.to_path_buf()
    };
    // Normalize path (OS separators, no mixed / and \) so File::open works on Windows
    resolved.components().collect::<PathBuf>()
}

/// Create engine and load model from MODEL_PATH if set. If DRAFT_MODEL_PATH is set, load draft for speculative decoding.
#[cfg(feature = "candle")]
pub fn init_engine_for_app() -> Option<std::sync::Arc<std::sync::Mutex<InferenceEngine>>> {
    let path = std::env::var("MODEL_PATH").ok().filter(|s| !s.trim().is_empty());
    let path = match path {
        Some(p) => p,
        None => {
            tracing::info!("MODEL_PATH not set; running without loaded model");
            return None;
        }
    };
    let path_buf = resolve_model_path(&path);
    let path_str = path_buf.to_string_lossy();

    if !path_buf.exists() {
        tracing::warn!(
            "MODEL_PATH file does not exist or is not accessible: {} (set MODEL_PATH with single quotes in PowerShell: $env:MODEL_PATH = 'C:\\path\\to\\model.gguf')",
            path_str
        );
        return None;
    }

    if std::fs::File::open(&path_buf).is_err() {
        tracing::warn!(
            "cannot open MODEL_PATH file (exists but not readable?): {}",
            path_str
        );
        return None;
    }

    let mut engine = InferenceEngine::new();
    if let Err(e) = engine.load_model(path_buf.as_path()) {
        tracing::warn!(
            "failed to load model from MODEL_PATH: {} (resolved path: {})",
            e,
            path_str
        );
        return None;
    }
    tracing::info!("model loaded from {}", path_str);
    if let Ok(draft) = std::env::var("DRAFT_MODEL_PATH") {
        let draft = draft.trim();
        if !draft.is_empty() {
            let draft_buf = resolve_model_path(draft);
            let draft_str = draft_buf.to_string_lossy();
            if draft_buf.exists() {
                if engine.load_draft_model(draft_buf.as_path()).is_ok() {
                    tracing::info!("draft model loaded from {}", draft_str);
                }
            }
        }
    }
    Some(std::sync::Arc::new(std::sync::Mutex::new(engine)))
}

#[cfg(not(feature = "candle"))]
impl Default for InferenceEngine {
    fn default() -> Self {
        Self::new()
    }
}
