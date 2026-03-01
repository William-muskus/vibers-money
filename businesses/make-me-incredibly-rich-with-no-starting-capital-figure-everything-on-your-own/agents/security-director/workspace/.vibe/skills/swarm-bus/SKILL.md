---
name: swarm-bus
description: How to use the Swarm Bus MCP. Use when coordinating with other agents (inbox, send message, spawn, escalate, budget, context). Tool names mcp_swarm_*.
---

# Use Swarm Bus MCP (MCP skill)

## When to use
- You need to coordinate with other agents (your manager, reports, or peers).
- At the **start of every work cycle** — check your inbox before doing anything else.
- When you finish work — report status to your manager.
- When you need to spawn a new agent (CEO or department managers only).
- When you need to escalate a decision, request budget, or reply to a message.

## How to use (tool names: `mcp_swarm_*`)

**Messaging**
- **`mcp_swarm_check_inbox`** — Get pending messages. Call at the start of every cycle. Use the **check-messages** skill for the full workflow.
- **`mcp_swarm_send_message`** — Send to one agent by role (`to`, `content`, optional `priority`). Use for status and directives. Use the **report-status** skill when reporting up.
- **`mcp_swarm_reply`** — Reply to a specific message by `message_id`.
- **`mcp_swarm_broadcast`** — (CEO only.) Send a message to all agents in the business.

**Spawning**
- **`mcp_swarm_spawn_agent`** — Create a new agent (role, business, mission, **macro_objectives** required). Use the **spawn-agent** meta-skill for the full workflow.

**Escalation**
- **`mcp_swarm_escalate`** — Escalate a decision to your manager (`question`, `options`, `context`).
- **`mcp_swarm_decision`** — (Manager/CEO.) Respond to an escalation (`escalation_id`, `decision`, optional `reasoning`).

**Budget** (if enabled)
- **`mcp_swarm_request_budget`**, **`mcp_swarm_approve_budget`**, **`mcp_swarm_report_spend`**, **`mcp_swarm_get_budget`**.

**Context**
- **`mcp_swarm_get_business_context`**, **`mcp_swarm_update_business_context`** — Key-value context shared across agents.

**Scheduling** (if enabled)
- **`mcp_swarm_schedule_event`**, **`mcp_swarm_cancel_event`**, **`mcp_swarm_list_events`**.

## Convention
- Your identity (agent_id, business_id) is set by the platform; you only pass role names (e.g. `ceo`, `marketing-director`) for `to` and `role`.
- Report **up** the chain (to your parent). Do not message the founder directly; the CEO handles founder chat.
- Prefer the task-specific skills (check-messages, report-status, spawn-agent) when they apply; use this skill as a reference for other Swarm Bus tools.
