# X.com Browser Automation Testing

## Prerequisites

- Chrome with `--remote-debugging-port=9222`
- Computer Use MCP running (port 3200)
- Pre-created test X (Twitter) account
- Optional: test Gmail for verification flows

## Test Cases

### 1. Post tweet (Community Manager flow)

1. Agent (e.g. community-manager) calls `mcp_computer_navigate` to `https://x.com`
2. Agent calls `mcp_computer_screenshot` to get annotated page
3. Agent finds "Post" or compose element by id, calls `mcp_computer_click(element_id)`
4. Agent calls `mcp_computer_type` with tweet content
5. Agent finds "Post" submit button, clicks it
6. Verify: screenshot shows success or tweet visible

### 2. Email verification (multi-tab)

1. Open Gmail in a tab (or second agent)
2. Navigate to inbox, find verification email
3. Click verification link
4. Return to X.com tab and continue

### 3. Captcha handling

- If X shows captcha: agent receives annotated screenshot with captcha element
- Escalate to human or use approved captcha service per security policy
- Document: captcha blocks full automation; demo uses accounts that do not trigger captcha or pre-verified sessions

## Running tests

With Chrome and Computer Use MCP running:

```bash
# From repo root; ensure CDP_PORT=9222 and COMPUTER_USE_URL=http://localhost:3200
# Use MCP client or curl to invoke tools with X-Agent-Id and X-Business-Id headers.
# Example: POST to Swarm Bus /api/inject to send "Post a test tweet" to community-manager,
# then watch Orchestrator SSE for that agent's tool calls (navigate, screenshot, click, type).
```

## Human-like timing

Computer Use MCP uses 30–120ms between keystrokes and cursor animation. For X.com specifically, ensure `engine/keyboard.ts` and `engine/cursor.ts` (if added) use delays that avoid rate-limiting.
