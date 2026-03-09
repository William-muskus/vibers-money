# Rust Inference Pipeline — Code Review

Full review of `packages/inference-engine/` (OpenAI-compatible stub + Candle-ready layout). Focus: correctness, API contract, safety, and readiness for Phases 4–6.

**Implementation status:** The recommended changes from §10 have been implemented: streaming final chunk + `[DONE]`, empty-messages 400, `ApiError` and handler `Result`, body limit 2 MiB, CORS via `CORS_ORIGIN`, config loading (`configs/roles.toml`) for model list, PORT env fallback, and custom `ToolChoice` deserializer for `"none"`/`"auto"`.

---

## 1. Structure and layout

**Verdict: Good.** Clear separation of API, inference stubs, and server.

| Area | Assessment |
|------|------------|
| **Crate layout** | `main.rs` → CLI + server bind; `lib.rs` exposes `api`, `inference`, `server`. No circular deps. |
| **api/** | `types`, `models`, `chat`, `fused` — matches plan. Types are shared for request/response. |
| **inference/** | `engine`, `sampling`, `speculative`, `constrained` stubs are in place for Phase 4–5. |
| **Config** | `configs/roles.toml` and `models/.gitkeep` present; config is not yet loaded in code (see §5). |

**Suggestion:** Add a `models/` module (e.g. `models/mod.rs`, `loader.rs`, `config.rs`) when you wire Candle so model paths and role mapping live in one place.

---

## 2. API contract (OpenAI compatibility)

### 2.1 GET `/v1/models`

- Returns `object: "list"` and `data: Vec<ModelInfo>` with `id`, `object`, `created`, `owned_by`. Matches typical list-models shape.
- **Gap:** Model list is env-only (`LOCAL_LLM_MODEL`). Plan expects config-driven models; once you load `configs/roles.toml`, drive this from loaded models or config.

### 2.2 POST `/v1/chat/completions`

**Non-streaming**

- Uses `id`, `object`, `created`, `model`, `choices`, `usage` with correct field names.
- **Gap:** `choices[].message.tool_calls` is always `None`. Vibe relies on tools/tool_choice; the stub does not yet return tool calls. When wiring Candle, you must support at least parsing and echoing (or actually executing) tool definitions and returning `tool_calls` when the model outputs function calls.

**Streaming**

- Sends a single SSE chunk: `data: {"id", "object", "created", "model", "choices": [{"index", "delta": {"content": "..."}, "finish_reason": null}]}\n\n`.
- **Gap:** No final chunk with `"finish_reason": "stop"` and empty `delta`. Many clients expect a terminal event; add e.g. a second chunk `data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n` and then optionally `data: [DONE]\n\n`.
- **Gap:** Content is sent in one chunk. Real streaming should emit token-by-token (or small token groups) for lower latency.

**Request handling**

- `temperature`, `max_tokens`, `stream`, `stop`, `tools`, `tool_choice`, `response_format` are accepted in types. **`stop`** is applied: generation stops when decoded output ends with any stop string. Tools are parsed from model output when no proxy; tool_choice deserializer supports `"none"`/`"auto"`.

---

## 3. Correctness and edge cases

| Issue | Location | Recommendation |
|-------|----------|----------------|
| **Empty messages** | `chat.rs` | If `messages` is empty, you use `content = ""` and return stub text. Safe. Consider validating `messages.len() >= 1` and returning 400 if empty. |
| **Role selection** | `chat.rs` | You take the *last* user message. Matches common “last user turn” semantics. Document that system/assistant messages are ignored in the stub. |
| **Streaming panic** | `chat.rs:109` | `Response::builder().body(body).unwrap()` can panic if the builder is invalid. You only set valid headers and body; low risk. Prefer `expect("valid response")` or `?` on a Result for clearer errors. |
| **SystemTime** | `chat.rs:16–21` | `unix_ts()` uses `duration_since(UNIX_EPOCH).unwrap_or_default()` — only panics if system time is before 1970. Acceptable for a server. |
| **Fused endpoint** | `fused.rs` | **Implemented:** loads from_role and to_role models from roles.toml, runs A → bridge → B; reuses a shared engine. Callers (Swarm Bus) treat non-ok as “fall back to normal path”. |

---

## 4. Error handling and robustness

- **Deserialization:** `Json<ChatCompletionRequest>` and `Json<FusedRequest>` return 400 with axum’s default when JSON is invalid. No extra handling needed for malformed JSON.
- **Missing error responses:** There is no explicit 500 or structured error body for “inference failed” yet. When you add Candle, return a proper error response (and optionally a request id) instead of panicking.
- **Config file:** `--config` is parsed but never read. If the file is missing, the binary still runs. When you load config, handle missing/invalid file (log and exit or run with defaults).

---

## 5. Security and production readiness

| Topic | Status | Recommendation |
|-------|--------|----------------|
| **CORS** | `CorsLayer::permissive()` | Allows all origins/methods/headers. Fine for local/Docker; for production, restrict to the frontend/orchestrator origins. |
| **Request body limit** | None | Axum does not limit JSON body size by default. Add a size limit (e.g. 1–2 MiB for chat) to avoid DoS via huge payloads. |
| **Timeouts** | `VIBERS_INFERENCE_TIMEOUT_SECS` | Streaming inference wrapped in `tokio::time::timeout` (default 300s). Configurable via env. |
| **Logging** | `tracing` + optional JSON | Good. Avoid logging full message content in production (PII); log lengths or hashes if needed. |

---

## 6. Performance and future Candle integration

- **Allocations:** Stub does simple string work and one response build; no hot loops. When adding inference, reuse buffers where possible (e.g. reuse a token buffer instead of allocating per token).
- **Async:** Handlers are `async`; no blocking calls. Candle inference will likely be CPU/GPU-bound; run it in `tokio::task::spawn_blocking` or a dedicated thread pool so the async runtime isn’t blocked.
- **Concurrency:** One request at a time in the stub. Real inference may need a queue or limit (e.g. one model load, N concurrent requests) to avoid OOM; design that when you integrate.

---

## 7. Types and serialization

- **Request types:** `ChatCompletionRequest`, `ChatMessage`, `Tool`, `FunctionDef`, `ResponseFormat`, `Stop`, `ToolChoice` cover the plan. `ToolChoice` deserialization may need adjustment for string `"none"`/`"auto"` (see §2.2).
- **Response types:** `ChatCompletionResponse`, `ChatChoice`, `ChatChoiceMessage`, `Usage`, `ModelListResponse`, `ModelInfo` match common OpenAI usage. `tool_calls` is `Option<Vec<serde_json::Value>>` — flexible; when you emit real tool calls, use a proper struct for clarity.
- **Fused:** `FusedRequest` / `FusedResponse` are clear. Ensure Swarm Bus and the Rust engine agree on the same JSON shape when you implement the fused path.

---

## 8. Docker and ops

- **Dockerfile:** Multi-stage; builds release binary, runs as non-root (no USER set; consider adding a non-root user). `configs` are copied; `models` are not in the image (mounted at runtime) — correct.
- **Config path:** CMD uses `configs/roles.toml`; working dir is `/app` and configs are copied to `/app/configs`, so the path is correct.
- **Env:** `PORT=8080` is set but the binary uses `--port 8080`; the binary ignores `PORT`. Either document that or read `PORT` in the binary when `--port` is not given.
- **Config not loaded:** The binary does not read `--config` yet. When you add config loading, fail fast if the file is required and missing.

---

## 9. Plan alignment checklist

| Plan item | Status |
|-----------|--------|
| GET `/v1/models` | Done (env-based). |
| POST `/v1/chat/completions` (stream + non-stream) | Done (stub). |
| `model`, `messages`, `temperature`, `max_tokens`, `stream`, `stop` | Accepted; **`stop`** applied in engine generate/stream/constrained/speculative. |
| `tools` / `tool_choice` | Accepted; not implemented (stub). |
| `response_format: { type: "json_object" }` | Accepted; Phase 5 trigger not wired. |
| Streaming format `data: {"choices":[{"delta":{"content":"..."}}]}\n\n` | Done; add final chunk and optional `[DONE]`. |
| POST `/v1/fused` | **Implemented:** A→B pipeline; loads models from roles.toml, reuses fused engine. |
| `--config`, `--port`, `--log-json` | Implemented. |
| Structured JSON logging | Implemented with `tracing-subscriber` JSON layer. |
| inference/ stubs (engine, sampling, speculative, constrained) | Present. |
| configs/roles.toml | Present; not loaded. |

---

## 10. Recommended changes (in priority order)

1. **Streaming:** Emit a final SSE chunk with `finish_reason: "stop"` (and optionally `data: [DONE]\n\n`) so clients that expect it don’t hang.
2. **Request validation:** Reject empty `messages` with 400 and a clear error message.
3. **Body size limit:** Add a JSON body size limit (e.g. `tower_http::limit::RequestBodyLimitLayer`) for `/v1/chat/completions` and `/v1/fused`.
4. **ToolChoice:** Fix deserialization for string `"none"` and `"auto"` (custom deserializer or `Option<Value>` + parse).
5. **Config:** Either load `roles.toml` from `--config` and use it for model list / defaults, or document that the file is unused until Phase 4.
6. **PORT env:** In `main.rs`, if `--port` is not passed, read `PORT` from the environment so Docker/env-based config works.
7. **CORS:** Add a build-time or runtime option to restrict CORS when not in local/dev mode.
8. **Error type:** Introduce a small error type and use `Result<Response, ApiError>` in chat/fused handlers so you can return 500 with a body when inference fails later.

---

## Summary

The crate is in good shape for a Phase 3 stub: API surface matches the plan, types are in place for tools and response_format, and the inference module is ready for Candle. The main gaps are: streaming terminal chunk, robust `tool_choice` parsing, request validation and body limits, and actually loading config and using it. Addressing the items in §10 will align the implementation with the spec and make the transition to real inference and Phase 4–6 smoother.
