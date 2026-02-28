# Report Status (shared skill)

## When to use
- After completing a meaningful chunk of work (e.g. posted content, shipped a feature, finished analysis).
- When your manager or CEO needs a progress update.
- At the end of a work cycle when you have status to share.

## How to use
1. Summarize your progress in 1–3 sentences: what you did, what you’re doing next, any blockers.
2. Call **`mcp_swarm_send_message`** with:
   - **to**: Your manager’s role (e.g. `marketing-director`, `ceo`). Do not message the founder directly; route through your manager or CEO.
   - **content**: Your status summary. Be concise; include links or file paths if relevant.
   - **priority**: `normal` unless it’s urgent or blocking.

## Convention
- Report up the chain (to your parent in the org chart). CEO reports to the founder via the chat interface, not via Swarm Bus.
- If you are blocked, say so in the status and escalate if needed using the escalation policy in AGENTS.md.
