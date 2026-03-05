---
name: swarm-bus
description: Complete reference for the Swarm Bus MCP. Covers all tools — inbox, messaging, registry, spawn, escalation, budget, context, scheduling. Tool names are mcp_swarm_*.
---

# Swarm Bus MCP — Complete Reference

The Swarm Bus is your coordination backbone. **Every agent must use it every cycle.**
Tool prefix: `mcp_swarm_*` (server name: `swarm-bus`).

---

## Work cycle (mandatory order)

1. `mcp_swarm_check_inbox` — read all pending messages first.
2. Process messages and do your work.
3. `mcp_swarm_report_status` — report progress to your manager before ending the cycle.

---

## Inbox & Messaging

### `mcp_swarm_check_inbox`
Get all unread messages from other agents. Call at the **start of every cycle**.
```
mark_read?: boolean   # default true — mark returned messages as read
```
Returns: `{ messages: Message[] }` — each message has `id`, `from_role`, `content`, `type`, `priority`, `timestamp`.

### `mcp_swarm_send_message`
Send a message to one agent by role name.
```
to: string           # role name, e.g. "ceo", "marketing-director", "community-manager"
content: string      # message body
priority?: "low" | "normal" | "high" | "urgent"   # default "normal"
```
> **Hierarchy rule**: you can only message your direct parent (upward) or your direct reports (downward).
> **Before sending**: call `mcp_swarm_list_agents` to confirm the role is already running. If it is not, spawn it first.

### `mcp_swarm_reply`
Reply to a specific message by ID (use the `id` from `mcp_swarm_check_inbox`).
```
message_id: string   # id of the message to reply to
content: string
```

### `mcp_swarm_broadcast`
**CEO only.** Send a message to every agent in the business at once.
```
content: string   # company-wide announcement
```

---

## Agent Registry

### `mcp_swarm_list_agents`
List all agents currently registered and running in this business.
```
(no parameters)
```
Returns: `{ agents: [{ role, agent_id, role_type, lifecycle }] }`

**Use before spawning or messaging** to avoid duplicates and "hierarchy or not found" errors.
- Only spawn a role if it is **not** already in the list.
- Only message a role after it **appears** in the list.

---

## Spawning

### `mcp_swarm_spawn_agent`
Create a new agent. Forwards to the Orchestrator, which provisions a workspace and launches the Vibe process.
```
role: string                  # e.g. "community-manager", "marketing-director"
business: string              # must match your own business_id
mission: string               # 2–4 sentence brief
macro_objectives: string[]    # required — 3–5 concrete outcomes; agent uses these for self-configuration
browser_domains?: string[]    # approved domains for computer-use, e.g. ["x.com", "twitter.com"]
skills?: string[]             # extra skill names to copy into the new agent's workspace
lifecycle?: "infinite_loop" | "task_based"   # default "infinite_loop"
```
> **Only CEO and department managers can spawn.** After spawning, poll `mcp_swarm_list_agents` until the new agent appears before sending it messages.

See also: **spawn-agent** meta-skill for the full workflow.

---

## Status

### `mcp_swarm_report_status`
Report your status (progress, blockers, results) to your parent agent.
```
content: string   # status update text
```
> Use the **report-status** skill for the recommended workflow and format.

---

## Escalation

Use when you need a decision from your manager that is above your authority.

### `mcp_swarm_escalate`
Escalate a decision upward.
```
question: string     # the decision to make
options: string[]    # list of possible options
context: string      # relevant background
```
Returns: `{ escalation_id: string }` — keep this to correlate the response.

### `mcp_swarm_decision`
**Managers/CEO only.** Respond to an escalation from a direct report.
```
escalation_id: string   # from the escalation message
decision: string        # chosen option
reasoning?: string      # optional explanation
```

---

## Budget

Use when you need to spend money. Always request before spending.

### `mcp_swarm_request_budget`
Request funds from your parent.
```
amount: number          # amount in USD
justification: string   # why you need it
category?: string       # e.g. "advertising", "tooling"
```
Returns: `{ request_id, status: "pending" }`.

### `mcp_swarm_approve_budget`
**Managers/CEO only.** Approve or deny a budget request from a direct report.
```
request_id: string      # from the request message
approved_amount: number # 0 to deny
reasoning?: string
```

### `mcp_swarm_report_spend`
Record actual spend (deducted from your allocated budget).
```
amount: number
description: string
category?: string
```

### `mcp_swarm_get_budget`
Check your own current budget.
```
(no parameters)
```
Returns: `{ allocated, spent, remaining }`.

---

## Shared Business Context

Key-value store shared by all agents in the same business. Use for facts that multiple agents need (e.g. brand name, target audience, Twitter handle).

### `mcp_swarm_get_business_context`
```
keys?: string[]   # omit to get all keys
```
Returns: `{ key: value, ... }`.

### `mcp_swarm_update_business_context`
```
updates: { [key: string]: string }   # key-value pairs to set
```

---

## Scheduling

Use to trigger an agent on a timer (e.g. periodic content posting).

### `mcp_swarm_schedule_event`
```
target_role: string        # role to wake on schedule
event_name: string         # label for this event
message: string            # message to deliver each interval
interval_seconds: number   # repeat interval
```
Returns: `{ event_id }`.

### `mcp_swarm_cancel_event`
```
event_id: string
```

### `mcp_swarm_list_events`
```
(no parameters)
```
Returns: `{ events: string[] }` — list of active event IDs.

---

## Conventions

- Your identity (`agent_id`, `business_id`) is injected automatically — you never set it.
- Address agents by **role name**, not agent_id, in `to`, `role`, and `target_role` fields.
- Report **up** the chain (to your parent). Only the CEO speaks to the founder.
- For the common workflows (check messages, report status, spawn) prefer the dedicated meta-skills; use this file as the definitive tool reference.
