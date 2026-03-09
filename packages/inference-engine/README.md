# Vibers Inference Engine

OpenAI-compatible HTTP API for local inference (GET `/v1/models`, POST `/v1/chat/completions`, POST `/v1/fused`). Used by the orchestrator when `LOCAL_LLM_API_BASE` points at this service.

**Recommended default for local inference:** Point `LOCAL_LLM_API_BASE` at this server (e.g. `http://localhost:8080/v1`) and set `LOCAL_LLM_ENGINE=rust-candle` in the app `.env`. Use Ollama (or `VIBERS_INFERENCE_PROXY_URL`) only when you need compatibility (e.g. tool calling without Rust parsing, or a different model backend).

## Build and run

Requires [Rust](https://rustup.rs/). From repo root:

```bash
# CPU only (slower; ~5–20 tok/s for 7B Q4)
npm run build:inference
npm run dev:inference-cpu

# GPU (RTX 4060/4070 etc.) — goal: high throughput (e.g. 100–250+ tok/s with speculative)
# Prereq: NVIDIA drivers + CUDA Toolkit. Then:
npm run build:inference-gpu
# Set MODEL_PATH (and optionally DRAFT_MODEL_PATH for speculative decoding), then:
npm run dev:inference-gpu
# To force CPU even with GPU build: VIBERS_INFERENCE_CPU=1 npm run dev:inference-gpu
#
# Windows: the build script adds CUDA's bin to PATH and prefers **CUDA 12.x** (candle/cudarc do not support 13.x yet).
# Install CUDA 12.x (e.g. 12.6) from https://developer.nvidia.com/cuda-downloads with Development/compiler components.
# Set `CUDA_PATH` to a 12.x toolkit root if you have multiple CUDA versions.

# With JSON logging (for LOG_JSON=1 compatibility)
cd packages/inference-engine && cargo run --release --features candle -- --config configs/roles.toml --port 8080 --log-json
```

Docker (from repo root, profile `local-inference`). The image is built with `--features candle` (CPU Candle); set `MODEL_PATH` (and optionally `DRAFT_MODEL_PATH`) when running the container. For GPU, use a CUDA base image and build with `--features candle,cuda` (see npm run build:inference-gpu).

```bash
docker compose --profile local-inference up -d inference
```

## Configuration

- `--config`: path to `configs/roles.toml` (used for model list, fused role mapping, and Phase 4 speculative defaults).
- `--port`: default 8080.
- `--log-json`: one JSON object per line (orchestrator-style).

### Config (roles.toml)

`configs/roles.toml` drives **GET /v1/models** (model list from `[roles.*].model`) and **POST /v1/fused** (role → model path for from_role and to_role). For chat completions, **MODEL_PATH** is the default loaded model at startup; **DRAFT_MODEL_PATH** (optional) enables speculative decoding. Put your GGUF files in `models/` (or set absolute paths) and ensure each `[roles.<name>]` has `model = "path"` for fused chains.

Env:
- `LOCAL_LLM_MODEL` (default `mistral:7b`) — used for `/v1/models` when `roles.toml` has no model list.
- **`VIBERS_INFERENCE_PROXY_URL`** — when set (e.g. `http://localhost:11434` for Ollama), the server forwards **POST /v1/chat/completions** and **GET /v1/models** to that URL (no Candle, no optimizations). **Leave unset** to use the full Rust+Candle pipeline.
- **`MODEL_PATH`** (when built with `--features candle`) — path to a GGUF model file; if set at startup, the server loads it and uses it for `/v1/chat/completions` when proxy is not set. Optional `VIBERS_TOKENIZER_PATH` for tokenizer.json.
- **`DRAFT_MODEL_PATH`** (optional, with `candle`) — path to a smaller GGUF model for **speculative decoding**. When set, the server loads both main and draft; chat uses draft to propose K tokens and main to verify (2–3x throughput when enabled).
- `PORT` — overrides `--port` when set (e.g. in Docker).
- `CORS_ORIGIN` — when set to a single origin (e.g. `https://app.example.com`), CORS is restricted to that origin; otherwise all origins are allowed.
- Request body limit: 2 MiB for `/v1/chat/completions` and `/v1/fused`.

### Full optimized pipeline (Rust + Candle only)

To use **GPU**, speculative decoding, token-level JSON constraint, and Candle streaming (target: **high tok/s**, e.g. 100–250+ on RTX 4060/4070):

1. **Do not set** `VIBERS_INFERENCE_PROXY_URL`.
2. **GPU:** Install [CUDA Toolkit](https://developer.nvidia.com/cuda-downloads) (match your driver). Build with CUDA: `npm run build:inference-gpu` and run with `npm run dev:inference-gpu`. Set `MODEL_PATH` (and optionally `DRAFT_MODEL_PATH` for 2–3× speculative speedup). To force CPU: `VIBERS_INFERENCE_CPU=1`.
3. **CPU-only:** `npm run build:inference` then `npm run dev:inference`; set `MODEL_PATH` as below.
4. When starting the server, set **`MODEL_PATH`** to your main GGUF path (and optionally **`DRAFT_MODEL_PATH`** for speculative decoding). The binary reads these from the process environment (it does not load the repo `.env`), so export them before running, e.g. PowerShell: `$env:MODEL_PATH="C:\path\to\model.gguf"; npm run dev:inference-gpu` or Bash: `MODEL_PATH=/path/to/model.gguf npm run dev:inference-gpu`.
5. In the app `.env`, point at this server: `LOCAL_LLM_API_BASE=http://localhost:8080`, `LOCAL_LLM_ENGINE=rust-candle`, and `FUSED_SIDECAR_URL=http://localhost:8080`.

## Current status

- **Phase 3:** Proxy and Candle supported. With `--features candle` and `MODEL_PATH`, real GGUF inference runs; optional proxy via `VIBERS_INFERENCE_PROXY_URL`.
- **Phase 4:** **Speculative decoding** implemented: set `DRAFT_MODEL_PATH` to load a draft model; chat uses draft to propose K tokens and main to verify (2–3x throughput).
- **Phase 5:** **Grammar-constrained JSON**: when `response_format: { type: "json_object" }`, token-level constraint (valid JSON object prefix) masks logits each step; post-hoc extraction as fallback.
- **Phase 6:** `/v1/fused` implements A→B pipeline (load A, run on input, load B, run on bridge, return content). **For `/v1/fused` to work**, define both the source and target roles in `configs/roles.toml` with a `model` path (e.g. `[roles.ceo]` and `[roles.marketing-director]` with `model = "models/....gguf"`); otherwise the endpoint returns an error that role models are not in config.
- **Streaming:** With Candle and a loaded model, `stream: true` streams token-by-token from the engine (SSE).
