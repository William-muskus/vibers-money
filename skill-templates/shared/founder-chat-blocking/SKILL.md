---
name: founder-chat-blocking
description: CEO — call orchestrator MCP set_awaiting_founder to pause idle until the founder replies.
---

# Founder chat — wait for the founder (structured flag)

You run in **programmatic** NDJSON streaming. **Do not** rely on special text in your reply to control the runtime.

## Tool

Use the **orchestrator** MCP tool (Vibe exposes it as **`mcp_orchestrator_set_awaiting_founder`**):

- **`wait: true`** — You are about to ask the founder something and must **not** run other idle work (timed inbox checks, deferred team wakes) until they send a chat message. Call **before or alongside** your normal assistant text that contains the question.
- **`wait: false`** — Only if you need to **cancel** a wait you previously set (rare).

Example arguments: `{ "wait": true }`

The founder still reads your question in your **normal assistant message** — this tool only sets orchestrator state.

## Rules

1. **CEO only** — other roles do not have the orchestrator MCP.
2. **Do not** use `swarm_send_message` to reach the founder.
3. After the founder answers, continue work; **do not** repeat the same questions.
4. **Inbox vs founder** — Until directors exist, team inbox prompts are secondary to the founder in chat.
5. **No `ask_user_question`** — Founder reads normal chat only.
6. **No paste-loops** — State a plan once; later turns = one-line status.
