---
name: check-messages
description: Check your Swarm Bus inbox at the start of every work cycle. Use mcp_swarm_check_inbox and process directives before other work.
---

# Check Messages (shared skill)

## When to use
- At the **start of every work cycle** before doing any other work.
- When you have been idle and want to see if your manager or peers sent you directives.

## How to use
1. Call **`mcp_swarm_check_inbox`** (no required arguments; optional: `mark_read: true` to mark messages as read).
2. The tool returns a list of pending messages (from your manager, CEO, or peers), including type (message, broadcast, escalation_response, etc.).
3. Process each message in order: follow directives, respond to escalations if you are the decision-maker, or add todos for follow-up.
4. If you have no messages, proceed with your normal work cycle (todos, mission work, status report).

## Convention
- Checking the inbox is the first step in the standard work cycle in AGENTS.md.
- Messages may contain mission updates, budget approvals, or urgent pivots; always process them before continuing proactive work.
