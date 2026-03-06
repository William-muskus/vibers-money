# Vibers Inference Engine

OpenAI-compatible HTTP API for local inference (GET `/v1/models`, POST `/v1/chat/completions`, POST `/v1/fused`). Used by the orchestrator when `LOCAL_LLM_API_BASE` points at this service.

## Build and run

Requires [Rust](https://rustup.rs/). From repo root:

```bash
# CPU only
npm run build:inference
npm run dev:inference-cpu

# With JSON logging (for LOG_JSON=1 compatibility)
cd packages/inference-engine && cargo run --release -- --config configs/roles.toml --port 8080 --log-json
```

Docker (from repo root, profile `local-inference`):

```bash
docker compose --profile local-inference up -d inference
```

## Configuration

- `--config`: path to `configs/roles.toml` (used for Phase 4 speculative decoding config).
- `--port`: default 8080.
- `--log-json`: one JSON object per line (orchestrator-style).

Env:
- `LOCAL_LLM_MODEL` (default `mistral:7b`) — used for `/v1/models` when `roles.toml` has no model list.
- **`VIBERS_INFERENCE_PROXY_URL`** — when set (e.g. `http://localhost:11434` for Ollama), the server forwards **POST /v1/chat/completions** and **GET /v1/models** to that URL (no Candle, no optimizations). **Leave unset** to use the full Rust+Candle pipeline.
- **`MODEL_PATH`** (when built with `--features candle`) — path to a GGUF model file; if set at startup, the server loads it and uses it for `/v1/chat/completions` when proxy is not set. Optional `VIBERS_TOKENIZER_PATH` for tokenizer.json.
- **`DRAFT_MODEL_PATH`** (optional, with `candle`) — path to a smaller GGUF model for **speculative decoding**. When set, the server loads both main and draft; chat uses draft to propose K tokens and main to verify (2–3x throughput when enabled).
- `PORT` — overrides `--port` when set (e.g. in Docker).
- `CORS_ORIGIN` — when set to a single origin (e.g. `https://app.example.com`), CORS is restricted to that origin; otherwise all origins are allowed.
- Request body limit: 2 MiB for `/v1/chat/completions` and `/v1/fused`.

### Full optimized pipeline (Rust + Candle only)

To use speculative decoding, token-level JSON constraint, and Candle streaming:

1. **Do not set** `VIBERS_INFERENCE_PROXY_URL`.
2. Build with Candle: `cargo build --release --features candle` (or `npm run build:inference` if it enables candle).
3. When starting the server, set **`MODEL_PATH`** to your main GGUF path (and optionally **`DRAFT_MODEL_PATH`** for speculative decoding). The binary reads these from the process environment (it does not load the repo `.env`), so export them before running, e.g. PowerShell: `$env:MODEL_PATH="C:\path\to\model.gguf"; npm run dev:inference` or Bash: `MODEL_PATH=/path/to/model.gguf npm run dev:inference`.
4. In the app `.env`, point at this server: `LOCAL_LLM_API_BASE=http://localhost:8080`, `LOCAL_LLM_ENGINE=rust-candle`, and `FUSED_SIDECAR_URL=http://localhost:8080`.

## Current status

- **Phase 3:** Proxy and Candle supported. With `--features candle` and `MODEL_PATH`, real GGUF inference runs; optional proxy via `VIBERS_INFERENCE_PROXY_URL`.
- **Phase 4:** **Speculative decoding** implemented: set `DRAFT_MODEL_PATH` to load a draft model; chat uses draft to propose K tokens and main to verify (2–3x throughput).
- **Phase 5:** **Grammar-constrained JSON**: when `response_format: { type: "json_object" }`, token-level constraint (valid JSON object prefix) masks logits each step; post-hoc extraction as fallback.
- **Phase 6:** `/v1/fused` implements A→B pipeline (load A, run on input, load B, run on bridge, return content).
- **Streaming:** With Candle and a loaded model, `stream: true` streams token-by-token from the engine (SSE).
