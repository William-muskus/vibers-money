# @vibers/inference-engine

llama.cpp (llama-server) inference for Vibers: flash attention, speculative decoding (main + draft), parallel slots.

## Prerequisites

- **llama-server** on PATH, or set `LLAMA_CPP_PATH` to the binary.
- **Install prebuilt (recommended):** from repo root run `npm run install:llama-server` (downloads Windows CUDA 12.4 build to `packages/inference-engine/bin/` and sets `LLAMA_CPP_PATH` in `.env`). Use `$env:LLAMA_CPU=1` before running for CPU-only.
- Build from source: [llama.cpp](https://github.com/ggml-org/llama.cpp) (see [build docs](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md)).
- Pre-built: [releases](https://github.com/ggml-org/llama.cpp/releases) (e.g. CPU or CUDA).

## Models

Place GGUF files in repo-root **`models/`** and set in `.env`:

- **Main**: `MODEL_PATH=models/Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-Q4_K_M.gguf`
- **Draft**: `DRAFT_MODEL_PATH=models/Qwen3.5-0.8B-Claude-4.6-Opus-Reasoning-Distilled-Q4_K_M.gguf`

Download from Hugging Face:

- [Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-GGUF](https://huggingface.co/Jackrong/Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-GGUF) (Q4_K_M)
- [Qwen3.5-0.8B-Claude-4.6-Opus-Reasoning-Distilled-GGUF](https://huggingface.co/Jackrong/Qwen3.5-0.8B-Claude-4.6-Opus-Reasoning-Distilled-GGUF) (Q4_K_M)

Optional: `npm run download-models` (requires `@huggingface/hub` or use the URLs above manually).

## Env vars (from repo root .env)

| Variable | Description |
|----------|-------------|
| `MODEL_PATH` | Main model path (relative to repo root). |
| `DRAFT_MODEL_PATH` | Draft model path (used only if `LLAMA_LOAD_DRAFT` is not `0`). |
| `LLAMA_LOAD_DRAFT` | `1` (default) load draft + speculative flags; `0` main model only — **recommended for Qwen3.5 hybrid** if logs say speculative decoding is disabled (saves ~500MB+ VRAM). |
| `LLAMA_CPP_PATH` | Path to `llama-server` binary (optional if on PATH). |
| `LLAMA_CONTEXT_SIZE` | Context size (default **32768**). Use 65536 if you have VRAM; below ~16k, Vibe sessions often hit **truncation** and **context exceeded**. |
| `VIBE_AUTO_COMPACT_THRESHOLD` | Optional. Mistral Vibe **auto_compact_threshold** (tokens). If unset and `LOCAL_LLM_API_BASE` is set, orchestrator writes **~75% of `LLAMA_CONTEXT_SIZE`** into each agent’s `.vibe/config.toml` at provision time. |
| `LLAMA_PORT` | Server port (default 8080). |
| `LLAMA_PARALLEL` | Parallel slots (`-np`). **Unset** = llama-server default (auto). Use **`1`** for best single-stream tokens/s; increase if many agents share the server concurrently. |
| `LLAMA_N_GPU_LAYERS` | GPU layers for main model (default **`all`**). Prefer `all` over a magic number (e.g. 99). |
| `LLAMA_CACHE_TYPE_K` / `LLAMA_CACHE_TYPE_V` | KV cache types (default **`q4_0`**). Saves VRAM; if you have headroom, try **`f16`** for often-faster decode on GPU. |
| `LLAMA_FLASH_ATTN` | `on` (default), `off`, or `auto`. |
| `LLAMA_BATCH` / `LLAMA_UBATCH` | Optional; maps to `-b` / `-ub` (llama.cpp defaults: 2048 / 512). |
| `LLAMA_THREADS` / `LLAMA_THREADS_BATCH` | Optional; `-t` / `-tb` for CPU-side work (prefill, offload). |
| `LLAMA_NO_WEBUI` | Set to `1` to pass `--no-webui` (slightly leaner server process). |
| `LLAMA_PERF` | Set to `1` to pass `--perf` (internal timing in logs). |
| `LLAMA_N_GPU_LAYERS_DRAFT` | Draft model GPU layers when draft is loaded (default **`all`**). |
| `LLAMA_DRAFT_MAX` / `LLAMA_DRAFT_MIN` | Speculative draft token bounds (defaults **16** / **5**). |

### Throughput (why tok/s can look “low”)

1. **Context size (`LLAMA_CONTEXT_SIZE`)** — KV scales with `n_ctx`; very large values (32k–64k) cost VRAM and memory bandwidth. Prefer the **smallest** context that works with Vibe `auto_compact_threshold` / your sessions.
2. **Parallel slots (`LLAMA_PARALLEL`)** — Extra slots reserve capacity for concurrent sequences. For **one** active chat/agent, **`1`** (or omit for auto) usually beats forcing 4.
3. **Draft model** — If logs say speculative decoding is **not** used for your model, set **`LLAMA_LOAD_DRAFT=0`** so VRAM and cycles go to the main model only.
4. **KV `q4_0`** — Trades compute for RAM; on some GPUs **`f16`** KV is faster if it fits.
5. **Multi-agent** — The stack shares **one** llama-server; queued requests and tool-heavy prompts are expected to lower *apparent* tok/s versus a bare benchmark.

## Run

From repo root:

```bash
npm run dev:inference
```

Starts llama-server on port 8080 with `-fa`, `--kv-unified`, optional draft model, and parallel slots. Orchestrator and Vibe agents use `LOCAL_LLM_API_BASE=http://localhost:8080/v1`.

If you see `speculative decoding not supported by this context` (common on **Qwen3.5** hybrid / recurrent KV), draft is not used for speedup; set `LLAMA_LOAD_DRAFT=0` to skip loading the draft GGUF.

## Troubleshooting (local agents)

| Symptom | Likely cause | What to do |
|--------|----------------|------------|
| `Context size has been exceeded` / `truncated = 1` in llama logs | Prompt + history + tool output &gt; `LLAMA_CONTEXT_SIZE` | Raise `LLAMA_CONTEXT_SIZE` (e.g. 32768–65536), restart `llama-server`, or start a fresh Vibe session. |
| `Failed to parse tool call arguments as JSON` / `missing closing quote` | Model emitted **invalid JSON** for a tool (often huge `write_file` **content**) | Use smaller writes per turn; see repo `skill-templates/shared/local-llm-constraints/SKILL.md`. |
| Orchestrator **circuit-break** after many exits | Previously counted every failure | Transient local-LLM errors are **no longer** counted toward the 5-strike break (upgrade orchestrator). |
