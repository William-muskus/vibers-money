//! Model loader for Candle (GGUF + tokenizer). Compiles only with `candle` feature.
#![cfg(feature = "candle")]
#![allow(dead_code)]

use candle_core::Device;
use candle_transformers::models::quantized_llama as model;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Loaded model + tokenizer for inference. Thread-safe via Mutex for forward (which is &mut).
pub struct LoadedModel {
    pub weights: Mutex<model::ModelWeights>,
    pub tokenizer: tokenizers::Tokenizer,
    pub device: Device,
    pub eos_token_id: Option<u32>,
}

const EOS_TOKEN: &str = "</s>";

/// Open model file. On Windows, if path as-is fails, try with forward slashes (Windows accepts both).
fn open_model_file(path: &Path) -> Result<std::fs::File, String> {
    std::fs::File::open(path)
        .or_else(|_e| {
            #[cfg(windows)]
            {
                let with_fwd = PathBuf::from(path.to_string_lossy().replace('\\', "/"));
                std::fs::File::open(&with_fwd)
            }
            #[cfg(not(windows))]
            Err(_e)
        })
        .map_err(|e| e.to_string())
}

/// Load GGUF model from path and tokenizer from tokenizer_path (e.g. tokenizer.json).
/// If tokenizer_path is None, uses same directory as model_path with "tokenizer.json".
pub fn load_gguf_llama(
    model_path: &Path,
    tokenizer_path: Option<&Path>,
    use_cuda: bool,
) -> Result<LoadedModel, String> {
    let device = if use_cuda {
        #[cfg(feature = "cuda")]
        {
            Device::new_cuda(0).map_err(|e| e.to_string())?
        }
        #[cfg(not(feature = "cuda"))]
        {
            return Err("CUDA requested but binary built without --features cuda. Rebuild with: cargo build --release --features candle,cuda".to_string());
        }
    } else {
        Device::Cpu
    };
    let mut file = open_model_file(model_path).map_err(|e| format!("model file: {}", e))?;
    let content = candle_core::quantized::gguf_file::Content::read(&mut file)
        .map_err(|e| format!("gguf read: {}", e))?;
    let weights =
        model::ModelWeights::from_gguf(content, &mut file, &device).map_err(|e| e.to_string())?;
    let tok_path: PathBuf = tokenizer_path
        .map(PathBuf::from)
        .unwrap_or_else(|| model_path.parent().unwrap_or(Path::new(".")).join("tokenizer.json"));
    let tokenizer = tokenizers::Tokenizer::from_file(tok_path.to_str().unwrap_or("tokenizer.json"))
        .map_err(|e| format!("tokenizer at {:?}: {}", tok_path, e))?;
    let eos_token_id = tokenizer
        .token_to_id(EOS_TOKEN)
        .or_else(|| tokenizer.token_to_id("<|endoftext|>"));
    Ok(LoadedModel {
        weights: Mutex::new(weights),
        tokenizer,
        device,
        eos_token_id,
    })
}
