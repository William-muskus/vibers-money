---
name: local-llm-constraints
description: Required when using a local OpenAI-compatible LLM (llama.cpp, etc.). Avoid tool-call JSON failures and context overflow.
---

# Local LLM constraints

The inference server must parse **tool calls as strict JSON**. Large or unescaped strings in arguments (especially `write_file` / `search_replace` **content**) often produce **invalid JSON** → HTTP 500 and `Failed to parse tool call arguments as JSON`.

## Rules

1. **Keep each `write_file` body small** — target **under ~2–4k characters** per call. For long docs: write a **stub** first, then **append** with additional `write_file` or `search_replace` steps.
2. **Avoid huge markdown tables and long unbroken strings** in a single tool argument; split across turns or files.
3. **Escape** quotes and newlines in JSON mentally: if the model emits broken JSON, **shorten** the payload and retry.
4. **Context budget**: Long sessions + big system prompts fill the KV cache. Orchestrator-generated Vibe config sets **`auto_compact_threshold`** to ~**75% of `LLAMA_CONTEXT_SIZE`** (same env as `llama-server`) so Vibe compacts history before local `n_ctx` pressure. If you see **context size exceeded** or **truncated** in logs, raise `LLAMA_CONTEXT_SIZE` and restart `llama-server`, set **`VIBE_AUTO_COMPACT_THRESHOLD`** explicitly, or start a **new session** / smaller tasks.
5. Prefer **bash** with a heredoc for very large static files only when the shell path is acceptable for your workspace policy — still keep total generation size reasonable.

## Symptoms (for debugging)

- `parse error … missing closing quote` inside tool arguments.
- `Context size has been exceeded` / `truncated = 1` in llama.cpp logs.
