# Appendix B: Swarm Bus MCP Server — Technical Specification

## Overview

The Swarm Bus is a **multi-agent communication and orchestration layer** exposed as an MCP server. It gives turn-based AI agents (Mistral Vibe, Claude Code, or any MCP-compatible runtime) the ability to send messages, escalate decisions, manage budgets, schedule recurring work, and share context — all through standard MCP tool calls.

The Swarm Bus solves two fundamental problems in multi-agent systems:

1. **Communication.** Turn-based agents have no native way to talk to each other. The Swarm Bus provides inbox-based asynchronous messaging with hierarchy enforcement.

2. **Orchestration.** The Swarm Bus supports two agent lifecycle models. **Always-running agents** (CEO, managers, operational specialists) are in an infinite resume loop managed by the backend — they check their inbox on every cycle and pick up messages immediately. **Task-based agents** (copywriters, builders) sleep until work arrives — the bus notifies the backend to wake them via webhook when a message lands in their inbox. The Swarm Bus doesn't manage the resume loop itself; it provides the inbox, the SSE observability stream, and the wake webhook for sleeping agents.

The result is a multi-agent swarm where most agents are **always alive and always grinding** — proactively working on their mission while absorbing messages and directives as they arrive. Task-based agents sleep efficiently until needed.

### Design Principles

- **MCP-native.** Agents call Swarm Bus tools exactly like they call `read_file` or `bash`. No special protocol, no SDK, no wrapper. Just tools.
- **Compatible with any lifecycle model.** Works with always-running agents (infinite resume loop) and sleeping agents (event-driven wake). The bus doesn't care how agents are scheduled — it stores messages and emits events either way.
- **Hierarchy-enforced.** Communication scope is defined by an org chart and enforced server-side. Agents can't bypass the chain of command.
- **Multi-tenant.** Multiple independent agent swarms (businesses, projects, teams) run on the same bus with complete isolation.
- **Observable.** Every message flows through a central server. Frontends subscribe via SSE to watch the swarm's nervous system in real time.
- **Portable.** Works with any MCP-compatible agent runtime. Not locked to any specific framework.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Swarm Bus MCP Server (Node.js, one process)                     │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐             │
│  │ Message      │  │ Escalation  │  │ Budget       │             │
│  │ Router       │  │ Manager     │  │ Controller   │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘             │
│         │                │                 │                      │
│  ┌──────┴────────────────┴─────────────────┴───────┐             │
│  │                Message Store                     │             │
│  │  (in-memory for MVP, Supabase for persistence)   │             │
│  └──────┬──────────────────────────────────────────┘             │
│         │                                                         │
│  ┌──────┴──────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ Scheduler   │  │ Wake Engine  │  │ SSE Emitter  │            │
│  │ (timers for │  │ (notifies    │  │ (streams to  │            │
│  │  business   │  │  backend to  │  │  frontend)   │            │
│  │  rules)     │  │  re-prompt)  │  │              │            │
│  └─────────────┘  └──────────────┘  └──────────────┘            │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐      │
│  │ Security Layer                                          │      │
│  │  • Agent identity (session → role mapping)              │      │
│  │  • Business isolation (tenant scoping)                  │      │
│  │  • Hierarchy enforcement (org chart rules)              │      │
│  │  • Message signing (HMAC)                               │      │
│  └────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘

        ▲ HTTP MCP transport              ▲ SSE stream          ▲ Wake webhook
        │                                  │                     │
   ┌────┴────┐                        ┌────┴─────┐         ┌────┴─────┐
   │  Vibe   │ (or any MCP client)    │ Frontend │         │ Backend  │
   │  Agents │                        │ (Next.js)│         │ (re-     │
   └─────────┘                        └──────────┘         │ prompts  │
                                                           │ agents)  │
                                                           └──────────┘
```

### Core Components

1. **Message Store** — Holds all messages, escalations, budget requests, and status updates. In-memory HashMap for the hackathon MVP, with optional Supabase persistence for durability.

2. **Message Router** — Routes messages between agents, enforcing hierarchy rules and business isolation. Sets the `from` field server-side based on the authenticated session.

3. **Escalation Manager** — Tracks open escalations (pending decisions) and routes responses back to the requesting agent.

4. **Budget Controller** — Enforces budget caps server-side. Tracks allocations per department, validates spend requests against remaining budget, and rejects over-budget requests regardless of what the agent asks for.

5. **Scheduler** — Manages recurring events (business rules). When a timer fires, it injects a message into the target agent's inbox and triggers the wake engine.

6. **Wake Engine** — The orchestration heart. When a new message arrives for an agent that isn't currently running, the wake engine calls a configurable webhook (e.g., `POST /api/swarm/wake`) to tell the backend to re-prompt that agent. This is the single integration point between the Swarm Bus and the agent runtime.

7. **SSE Emitter** — Streams every bus event to subscribed frontend clients. The frontend watches the bus to render graph visualizations, financial feeds, and activity streams without polling agents or parsing their output.

8. **Security Layer** — Identity verification, business isolation, hierarchy enforcement, and message signing. All enforced server-side — agents cannot bypass these rules through tool calls.

---

## Agent Registration

Before an agent can use the Swarm Bus, it must be registered. Registration happens at agent spawn time — the parent agent (or backend) registers the new agent with the bus.

### Registration API

```
POST /api/register
{
  "agent_id": "vintage-stickers--marketing-director",
  "business_id": "vintage-stickers",
  "role": "marketing-director",
  "role_type": "department_manager",
  "lifecycle": "infinite_loop",
  "parent": "vintage-stickers--ceo",
  "children": [],
  "wake_endpoint": "http://localhost:3000/api/swarm/wake",
  "wake_payload": {
    "session_id": "vibe-session-abc123",
    "workdir": "/businesses/vintage-stickers/marketing/"
  }
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `agent_id` | string | Unique identifier. Convention: `{business_id}--{role}` |
| `business_id` | string | Tenant ID. All messages scoped to this. |
| `role` | string | Human-readable role name (e.g., "marketing-director", "community-manager") |
| `role_type` | enum | `"ceo"`, `"department_manager"`, or `"specialist"` — determines hierarchy rules |
| `lifecycle` | enum | `"infinite_loop"` or `"task_based"`. Infinite loop agents are always running — the bus does NOT fire wake webhooks for them (messages wait in inbox for the next cycle). Task-based agents sleep — the bus fires a wake webhook when a message arrives. |
| `parent` | string | `agent_id` of the parent in the hierarchy. CEO's parent is `null`. |
| `children` | string[] | `agent_id`s of direct reports. Updated as agents spawn subordinates. |
| `wake_endpoint` | string | URL to POST when this agent needs to be woken. Only used for `lifecycle: "task_based"` agents. |
| `wake_payload` | object | Opaque payload passed to the wake endpoint (session ID, workdir, etc.) |

**On registration**, the bus:
- Validates `business_id` matches the parent's `business_id`
- Creates an empty inbox for the agent
- Adds the agent to the org chart
- Updates the parent's `children` array
- Returns a session token used to authenticate subsequent MCP tool calls

### Deregistration

```
POST /api/deregister
{
  "agent_id": "vintage-stickers--community-manager"
}
```

Removes the agent from the org chart, cancels its scheduled events, and clears its inbox. Orphaned children (if any) are re-parented to the deregistered agent's parent.

---

## MCP Tool Definitions

All tools are prefixed with `swarm_` to namespace them clearly in the agent's tool list.

### Messaging

#### `swarm_check_inbox`

Check for pending messages. **Every agent should call this at the start of every turn.** This is the primary perception mechanism — how agents discover new work.

```json
{
  "name": "swarm_check_inbox",
  "description": "Check your inbox for pending messages from other agents. Call this at the START of every turn before doing any work. Returns messages, escalation responses, budget decisions, and broadcasts. Messages are marked as read after retrieval.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "mark_read": {
        "type": "boolean",
        "description": "Whether to mark returned messages as read. Default: true"
      }
    }
  }
}
```

**Returns:**

```json
{
  "messages": [
    {
      "id": "msg-001",
      "type": "message",
      "from": "ceo",
      "from_agent_id": "vintage-stickers--ceo",
      "content": "Shift to meme-style posts, the audience loves them",
      "priority": "normal",
      "timestamp": "2026-03-01T14:23:00Z"
    },
    {
      "id": "esc-resp-001",
      "type": "escalation_response",
      "escalation_id": "esc-001",
      "decision": "$3",
      "reasoning": "Optimize for adoption in first week, we can raise later",
      "from": "ceo",
      "timestamp": "2026-03-01T14:24:00Z"
    },
    {
      "id": "sched-001",
      "type": "scheduled_event",
      "event_name": "time_to_post",
      "message": "Create new content. Review recent engagement and decide what to post.",
      "timestamp": "2026-03-01T14:30:00Z"
    }
  ],
  "unread_count": 0
}
```

**Message types returned:**
- `message` — Direct message from another agent
- `broadcast` — CEO broadcast to all departments
- `escalation` — Decision request from a subordinate (for managers/CEO)
- `escalation_response` — Response to an escalation the agent submitted
- `budget_request` — Budget request from a subordinate (for managers/CEO)
- `budget_response` — Response to a budget request the agent submitted
- `scheduled_event` — Fired by the scheduler based on the agent's business rules

#### `swarm_send_message`

Send a message to another agent.

```json
{
  "name": "swarm_send_message",
  "description": "Send a message to another agent by role name. Messages are delivered to the target's inbox and trigger a wake if the target is sleeping. You can only message agents in your chain of command: your parent (upward) or your direct reports (downward).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "to": {
        "type": "string",
        "description": "Role name of the target agent (e.g., 'ceo', 'community-manager', 'marketing-director')"
      },
      "content": {
        "type": "string",
        "description": "Message content"
      },
      "priority": {
        "type": "string",
        "enum": ["low", "normal", "high", "urgent"],
        "description": "Message priority. 'urgent' triggers immediate wake. Default: 'normal'"
      }
    },
    "required": ["to", "content"]
  }
}
```

**Server-side enforcement:**
1. Resolve `to` role name → `agent_id` within the sender's `business_id`
2. Validate hierarchy: sender can message their parent OR their direct children. Cross-department messaging is blocked.
3. Set `from` field server-side from the sender's session. Agents cannot spoof their identity.
4. Store message in target's inbox
5. Emit SSE event for frontend observability
6. If target agent is sleeping, trigger wake engine

**Returns:** `{ "delivered": true, "message_id": "msg-001", "to": "community-manager" }`

#### `swarm_broadcast`

Broadcast a message to all department managers (CEO-only).

```json
{
  "name": "swarm_broadcast",
  "description": "Broadcast a message to ALL department managers and their specialists. CEO only. Use for pivots, company-wide announcements, or strategic direction changes. Every agent in the org will receive this message.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "content": {
        "type": "string",
        "description": "Broadcast message content"
      }
    },
    "required": ["content"]
  }
}
```

**Server-side enforcement:** Only agents with `role_type: "ceo"` can broadcast. The bus delivers the message to every agent in the same `business_id`, not just direct children. This is the only tool that bypasses normal hierarchy scoping.

#### `swarm_reply`

Reply to a specific message (preserves thread context).

```json
{
  "name": "swarm_reply",
  "description": "Reply to a specific message by its message_id. The reply is delivered to the original sender's inbox.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message_id": {
        "type": "string",
        "description": "The ID of the message to reply to"
      },
      "content": {
        "type": "string",
        "description": "Reply content"
      }
    },
    "required": ["message_id", "content"]
  }
}
```

### Escalation

#### `swarm_escalate`

Escalate a decision to a parent agent. Structured format so the parent can decide efficiently.

```json
{
  "name": "swarm_escalate",
  "description": "Escalate a decision to your manager (or to the CEO if you are a department manager). Provide structured options and context so the decision-maker can respond quickly. Use this when you encounter a decision that is outside your authority, irreversible, expensive, or related to brand identity.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "The decision question, stated clearly"
      },
      "options": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Array of options with brief rationale for each (e.g., ['$3 - maximize adoption', '$5 - higher margin'])"
      },
      "context": {
        "type": "string",
        "description": "Relevant context: what you were working on, why this came up, what data you have"
      },
      "category": {
        "type": "string",
        "enum": ["strategic", "tactical", "brand", "financial", "security", "prompt_injection_attempt"],
        "description": "Category of escalation. 'prompt_injection_attempt' triggers Security Director alert."
      },
      "blocking": {
        "type": "boolean",
        "description": "Whether this decision is blocking your current work. Default: true"
      }
    },
    "required": ["question", "options", "context"]
  }
}
```

**Server-side behavior:**
1. Store escalation in the parent's inbox with type `escalation`
2. If `category` is `prompt_injection_attempt`, also CC the Security Director (if registered)
3. Track escalation as "pending" in the escalation manager
4. Trigger wake for the parent agent
5. Emit SSE event (frontends show this as a glowing edge between two nodes)

**Returns:** `{ "escalation_id": "esc-001", "routed_to": "ceo", "status": "pending" }`

#### `swarm_decision`

Respond to an escalation (manager/CEO only).

```json
{
  "name": "swarm_decision",
  "description": "Respond to an escalation from a subordinate. Provide your decision and reasoning. The response is delivered to the original requester's inbox.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "escalation_id": {
        "type": "string",
        "description": "The escalation ID to respond to"
      },
      "decision": {
        "type": "string",
        "description": "Your decision"
      },
      "reasoning": {
        "type": "string",
        "description": "Brief reasoning for the decision"
      }
    },
    "required": ["escalation_id", "decision"]
  }
}
```

**Server-side enforcement:** Only the agent the escalation was routed to can respond. Validates `escalation_id` exists and is still pending.

### Budget

#### `swarm_request_budget`

Request additional budget from parent agent.

```json
{
  "name": "swarm_request_budget",
  "description": "Request additional budget from your manager or the CEO. Include the amount needed and a justification. The request is delivered to your parent's inbox for approval.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "amount": {
        "type": "number",
        "description": "Amount requested in USD"
      },
      "justification": {
        "type": "string",
        "description": "Why you need this budget and what it will be spent on"
      },
      "category": {
        "type": "string",
        "description": "Spend category (e.g., 'advertising', 'infrastructure', 'content', 'tools')"
      }
    },
    "required": ["amount", "justification"]
  }
}
```

**Returns:** `{ "request_id": "budget-001", "routed_to": "ceo", "status": "pending" }`

#### `swarm_approve_budget`

Approve or modify a budget request (manager/CEO only).

```json
{
  "name": "swarm_approve_budget",
  "description": "Approve, modify, or deny a budget request from a subordinate.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "request_id": {
        "type": "string",
        "description": "The budget request ID to respond to"
      },
      "approved_amount": {
        "type": "number",
        "description": "The amount approved (0 to deny, or a different amount to modify)"
      },
      "reasoning": {
        "type": "string",
        "description": "Brief reasoning for the decision"
      }
    },
    "required": ["request_id", "approved_amount"]
  }
}
```

**Server-side enforcement:**
1. Validate the approver is the parent of the requester
2. Check that `approved_amount` doesn't exceed the approver's remaining budget
3. Deduct from the approver's budget, credit to the requester's budget
4. If amount exceeds business total funds, reject regardless of approval

#### `swarm_report_spend`

Report a spend event (any agent that spends money).

```json
{
  "name": "swarm_report_spend",
  "description": "Report that you spent money. This deducts from your department's budget and is logged in the financial feed. Every real expenditure must be reported.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "amount": {
        "type": "number",
        "description": "Amount spent in USD"
      },
      "description": {
        "type": "string",
        "description": "What the money was spent on"
      },
      "category": {
        "type": "string",
        "description": "Spend category (e.g., 'advertising', 'infrastructure', 'content')"
      }
    },
    "required": ["amount", "description"]
  }
}
```

**Server-side enforcement:**
1. Validate spend doesn't exceed the agent's (or its department's) remaining budget
2. Deduct from budget
3. Log transaction
4. Emit SSE event (frontend shows this in the financial feed as a red outflow)

**Returns:** `{ "recorded": true, "remaining_budget": 42.50, "transaction_id": "tx-001" }`

#### `swarm_get_budget`

Check current budget status.

```json
{
  "name": "swarm_get_budget",
  "description": "Check your current budget status: total allocated, spent, and remaining.",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

**Returns:**

```json
{
  "allocated": 100.00,
  "spent": 57.50,
  "remaining": 42.50,
  "transactions": [
    { "id": "tx-001", "amount": 25.00, "description": "X promoted post", "category": "advertising", "timestamp": "..." },
    { "id": "tx-002", "amount": 32.50, "description": "Landing page hosting", "category": "infrastructure", "timestamp": "..." }
  ]
}
```

### Scheduling

#### `swarm_schedule_event`

Schedule a recurring event (business rule). For always-running agents (infinite loop), scheduled events are **supplementary nudges** — the agent is already grinding continuously and will pick up the event on its next cycle. For task-based agents, scheduled events can wake them via the wake engine. Scheduled events are most useful for time-sensitive cadence that agents might drift from (e.g., "post every 10 minutes exactly").

```json
{
  "name": "swarm_schedule_event",
  "description": "Schedule a recurring event that will inject a message into an agent's inbox at a regular interval. Use 'self' as target to schedule your own business rules. When the event fires, the target agent is woken with the message content. Use this for operational cadence: posting schedules, engagement checks, analytics reviews.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "target": {
        "type": "string",
        "description": "Role name of the target agent, or 'self' to schedule for yourself"
      },
      "event_name": {
        "type": "string",
        "description": "Unique name for this event (e.g., 'time_to_post', 'check_engagement', 'daily_review')"
      },
      "interval": {
        "type": "string",
        "description": "Interval between firings. Format: '{number}{unit}' where unit is 's' (seconds), 'm' (minutes), 'h' (hours). Examples: '90s', '10m', '1h'"
      },
      "message": {
        "type": "string",
        "description": "Message content delivered to the target when the event fires. Should describe what work to do."
      },
      "start_delay": {
        "type": "string",
        "description": "Optional delay before the first firing. Same format as interval. Default: fires immediately, then repeats at interval."
      }
    },
    "required": ["target", "event_name", "interval", "message"]
  }
}
```

**Server-side behavior:**
1. Validate that the sender can schedule for the target (self, or own children only)
2. Parse interval string into milliseconds
3. Create a recurring timer in the scheduler
4. On each tick: inject a `scheduled_event` message into the target's inbox → trigger wake engine
5. Store event metadata for cancellation

**Hierarchy enforcement for scheduling:**
- Any agent can schedule events for `"self"`
- Department managers can schedule events for their specialists
- CEO can schedule events for department managers
- Agents cannot schedule events for agents outside their chain of command

**Returns:** `{ "event_id": "evt-001", "event_name": "time_to_post", "target": "self", "interval": "10m", "next_fire": "2026-03-01T14:40:00Z" }`

#### `swarm_cancel_event`

Cancel a scheduled event.

```json
{
  "name": "swarm_cancel_event",
  "description": "Cancel a scheduled event. Use 'self' as target to cancel your own events. Agents can reconfigure their own operational cadence by cancelling and re-scheduling events.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "target": {
        "type": "string",
        "description": "Role name of the target agent, or 'self'"
      },
      "event_name": {
        "type": "string",
        "description": "Name of the event to cancel"
      }
    },
    "required": ["target", "event_name"]
  }
}
```

#### `swarm_list_events`

List active scheduled events for an agent.

```json
{
  "name": "swarm_list_events",
  "description": "List all active scheduled events for yourself or a subordinate agent.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "target": {
        "type": "string",
        "description": "Role name of the agent to list events for, or 'self'. Default: 'self'"
      }
    }
  }
}
```

**Returns:**

```json
{
  "events": [
    { "event_id": "evt-001", "event_name": "time_to_post", "interval": "10m", "next_fire": "2026-03-01T14:40:00Z", "fires_count": 3 },
    { "event_id": "evt-002", "event_name": "check_engagement", "interval": "90s", "next_fire": "2026-03-01T14:31:30Z", "fires_count": 12 }
  ]
}
```

### Status & Context

#### `swarm_report_status`

Report progress to the bus (and indirectly to the frontend and parent agent).

```json
{
  "name": "swarm_report_status",
  "description": "Report your current status and progress. This is visible to your manager and to the frontend dashboard. Use after completing significant work, reaching milestones, or encountering blockers.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "update": {
        "type": "string",
        "description": "Status update text"
      },
      "status": {
        "type": "string",
        "enum": ["working", "idle", "blocked", "completed", "error"],
        "description": "Current agent status"
      },
      "artifacts": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Optional list of file paths or URLs for work products created"
      }
    },
    "required": ["update"]
  }
}
```

**Server-side behavior:**
1. Store status update
2. Emit SSE event (frontend updates graph node color/state)
3. Deliver as a message to the agent's parent (so managers see subordinate progress)

#### `swarm_get_business_context`

Read shared business context (key-value store for the whole business).

```json
{
  "name": "swarm_get_business_context",
  "description": "Read shared business context. This is the single source of truth for business-wide decisions: brand guidelines, target audience, pricing, product spec. All agents in the business can read this.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "key": {
        "type": "string",
        "description": "Optional specific key to read (e.g., 'target_audience', 'pricing', 'brand_voice'). If omitted, returns all context."
      }
    }
  }
}
```

**Returns:**

```json
{
  "context": {
    "business_name": "Vintage Stickers",
    "target_audience": "developers - especially those in the React/JS ecosystem who love nostalgic tech culture",
    "brand_voice": "witty, self-aware, insider humor. Think @ThePracticalDev energy.",
    "pricing": "$3 starter pack, $8 premium bundle",
    "product_description": "Retro-style developer stickers with witty tech humor"
  }
}
```

#### `swarm_update_business_context`

Write to shared business context (CEO and department managers only).

```json
{
  "name": "swarm_update_business_context",
  "description": "Update shared business context. CEO and department managers only. Use when a strategic decision changes business-wide parameters (pricing change, audience pivot, new product feature). All agents read this context.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "key": {
        "type": "string",
        "description": "Context key to update"
      },
      "value": {
        "type": "string",
        "description": "New value"
      }
    },
    "required": ["key", "value"]
  }
}
```

**Server-side enforcement:** Only `role_type: "ceo"` or `role_type: "department_manager"` can write. Specialists can only read. All writes are logged with author and timestamp for audit trail.

---

## Security Architecture

### Agent Identity & Authentication

When an agent registers, the bus returns a session token. This token is passed in every MCP tool call (as a query parameter on the MCP server URL or as a header). The bus uses this token to:

1. **Identify the caller** — determine `agent_id`, `role`, `role_type`, `business_id`
2. **Set the `from` field** — agents cannot choose who they claim to be
3. **Enforce hierarchy** — determine what the caller is allowed to do

```
Agent config.toml:
[[mcp_servers]]
name = "swarm"
transport = "http"
url = "http://localhost:3100/swarm?token=session-abc123"
```

The bus resolves `session-abc123` → `{ agent_id: "vintage-stickers--marketing-director", business_id: "vintage-stickers", role: "marketing-director", role_type: "department_manager", parent: "vintage-stickers--ceo" }`.

### Business Isolation (Multi-Tenancy)

Every operation is scoped to the caller's `business_id`. An agent in business A physically cannot:

- Send messages to agents in business B
- Read business B's shared context
- See business B's budget or transactions
- Schedule events for business B's agents

This is enforced at the data layer — the message store, context store, budget ledger, and scheduler are all partitioned by `business_id`.

### Hierarchy Enforcement

The org chart defines communication scope:

| Role Type | Can message | Can schedule events for | Can read budget of | Can approve budget for |
|-----------|------------|------------------------|--------------------|----------------------|
| `ceo` | Any agent in its business | Department managers | All departments | Department managers |
| `department_manager` | CEO + own specialists | Own specialists | Own department | Own specialists |
| `specialist` | Own department manager only | Self only | Own budget only | Nobody |

**Special cases:**
- `swarm_broadcast` — CEO only, reaches all agents
- `swarm_escalate` — always routes to parent (specialists → manager, managers → CEO)
- `swarm_report_status` — always routes to parent + frontend SSE

**Cross-department communication:** Not allowed directly. If marketing needs something from product, marketing escalates to CEO, CEO sends a directive to product. This prevents chaotic cross-talk and keeps the CEO as the coordination point — exactly like a real company.

### Message Signing

Every stored message includes an HMAC signature:

```javascript
const signature = hmac(
  SECRET_KEY,
  `${from_agent_id}:${to_agent_id}:${business_id}:${payload}:${timestamp}`
);
```

This prevents message tampering in the store. If an attacker gains access to the message store (e.g., through a file system exploit), they cannot forge messages that pass signature validation.

---

## Wake Engine

The wake engine is the orchestration mechanism for **task-based agents only** (copywriters, frontend builders, data analysts — agents that sleep between assignments). Always-running agents (CEO, department managers, operational specialists) don't need the wake engine — they're in an infinite resume loop managed by the backend and will pick up messages on their next cycle.

### How It Works

1. A new message arrives in agent X's inbox (via `swarm_send_message`, `swarm_broadcast`, `swarm_decision`, scheduled event, etc.)
2. The bus checks: is agent X registered as a task-based (sleeping) agent? And is it currently inactive? (tracked via a `last_active` heartbeat — if no tool call in the last 30 seconds, assume sleeping)
3. If sleeping task-based agent: POST to agent X's `wake_endpoint` with `wake_payload`
4. The backend receives the webhook and re-prompts the agent:
   ```bash
   vibe --resume {session_id} --workdir {workdir} --prompt "Continue." --auto-approve --output streaming
   ```
5. Agent wakes, calls `swarm_check_inbox()`, gets the message, does work
6. Agent finishes and exits. It goes back to sleep until the next message arrives.

For always-running agents, step 2 short-circuits — the bus stores the message in the inbox and emits the SSE event, but does NOT fire a wake webhook. The agent will pick up the message on its next resume cycle (typically within seconds).

### Wake Deduplication

If 5 messages arrive for a sleeping task-based agent in rapid succession, the bus doesn't fire 5 wake webhooks. It fires one, and waits for the agent to call `swarm_check_inbox()` (which marks it as active). All 5 messages will be returned in that single inbox check.

```javascript
class WakeEngine {
  constructor() {
    this.pendingWakes = new Map();  // agent_id → setTimeout handle
    this.wakeDebounceMs = 500;     // Wait 500ms for more messages before waking
  }

  scheduleWake(agentId) {
    const agent = this.registry.get(agentId);

    // Only wake task-based agents. Infinite loop agents are already running
    // and will pick up messages on their next cycle.
    if (!agent || agent.lifecycle === 'infinite_loop') return;

    // If a wake is already pending, don't schedule another
    if (this.pendingWakes.has(agentId)) return;

    const handle = setTimeout(async () => {
      this.pendingWakes.delete(agentId);
      if (!agent || agent.isActive) return;

      await fetch(agent.wake_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent.wake_payload)
      });
    }, this.wakeDebounceMs);

    this.pendingWakes.set(agentId, handle);
  }
}
```

### External Event Injection

The wake engine also accepts events from external sources (Stripe webhooks, X callbacks, analytics triggers). These arrive via a dedicated API:

```
POST /api/inject
{
  "business_id": "vintage-stickers",
  "target_role": "finance-specialist",
  "event_type": "stripe_payment",
  "content": "New payment received: $4.99 from customer@email.com for Starter Pack",
  "metadata": {
    "stripe_payment_id": "pi_abc123",
    "amount": 4.99,
    "currency": "usd"
  }
}
```

This creates a message in the target agent's inbox and triggers the wake engine. The backend maps Stripe webhooks, X callbacks, etc. to this injection API.

---

## SSE Observability Stream

The bus exposes an SSE endpoint that streams every event in real time. Frontends subscribe to this for graph visualization, financial feeds, and activity streams.

### SSE Endpoint

```
GET /api/events/stream?business_id=vintage-stickers
GET /api/events/stream?admin=true  (all businesses — admin mosaic view)
```

### Event Format

```json
{
  "event_type": "message_sent",
  "business_id": "vintage-stickers",
  "from": "marketing-director",
  "to": "community-manager",
  "content_preview": "Shift to meme-style posts...",
  "priority": "normal",
  "timestamp": "2026-03-01T14:23:00Z"
}
```

### Event Types

| Event Type | Emitted When | Frontend Use |
|-----------|-------------|-------------|
| `agent_registered` | New agent joins the swarm | Add node to graph (always-lit for infinite_loop, dim for task_based) |
| `agent_deregistered` | Agent removed from swarm | Remove node from graph |
| `message_sent` | Any message delivered | Animate edge between nodes |
| `broadcast` | CEO broadcasts | Flash all nodes |
| `escalation_created` | Agent escalates to parent | Show glowing edge upward |
| `escalation_resolved` | Manager/CEO responds to escalation | Change edge color to resolved |
| `budget_requested` | Agent requests budget | Show budget icon on edge |
| `budget_approved` | Budget request approved | Update budget bars |
| `spend_reported` | Agent reports expenditure | Red pulse on financial feed |
| `event_scheduled` | Agent schedules business rule | Show timer icon on node |
| `event_fired` | Scheduled event triggers | Pulse node |
| `event_cancelled` | Scheduled event removed | Remove timer icon |
| `status_update` | Agent reports status | Update node label/color |
| `context_updated` | Business context changed | Flash context indicator |
| `agent_woken` | Wake engine re-prompts agent | Node lights up |
| `external_event` | Stripe/X/analytics event injected | Special edge from external source |

### Admin Stream (All Businesses)

The admin SSE stream (`?admin=true`) includes events from all businesses. Each event carries `business_id` so the admin mosaic can route events to the correct swarm thumbnail. The admin stream is authenticated and only accessible to the platform operator.

---

## Data Model

### In-Memory Store (Hackathon MVP)

```typescript
interface SwarmStore {
  // Agent registry
  agents: Map<string, AgentRegistration>;

  // Inboxes: agent_id → message queue
  inboxes: Map<string, Message[]>;

  // Escalations: escalation_id → escalation details
  escalations: Map<string, Escalation>;

  // Budget ledger: agent_id → budget state
  budgets: Map<string, BudgetState>;

  // Scheduled events: event_id → timer handle + metadata
  scheduledEvents: Map<string, ScheduledEvent>;

  // Business context: business_id → key-value pairs
  businessContext: Map<string, Map<string, string>>;

  // Audit log: append-only list of all events
  auditLog: BusEvent[];
}

interface Message {
  id: string;
  type: 'message' | 'broadcast' | 'escalation' | 'escalation_response' |
        'budget_request' | 'budget_response' | 'scheduled_event' | 'external_event';
  from_agent_id: string;
  from_role: string;
  to_agent_id: string;
  business_id: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  timestamp: string;
  read: boolean;
  metadata?: Record<string, any>;
  signature: string;
}

interface BudgetState {
  agent_id: string;
  business_id: string;
  allocated: number;
  spent: number;
  transactions: Transaction[];
}

interface ScheduledEvent {
  event_id: string;
  target_agent_id: string;
  business_id: string;
  event_name: string;
  interval_ms: number;
  message: string;
  timer_handle: NodeJS.Timeout;
  fires_count: number;
  created_by: string;
  created_at: string;
}
```

### Persistence (Post-Hackathon)

For durability beyond the hackathon, the in-memory store is backed by Supabase:

```sql
-- Core tables
CREATE TABLE agents (
  agent_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  role TEXT NOT NULL,
  role_type TEXT NOT NULL,
  parent_agent_id TEXT REFERENCES agents(agent_id),
  wake_endpoint TEXT,
  wake_payload JSONB,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  from_agent_id TEXT NOT NULL,
  to_agent_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  read BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  signature TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE budgets (
  agent_id TEXT PRIMARY KEY REFERENCES agents(agent_id),
  business_id TEXT NOT NULL,
  allocated DECIMAL(10,2) DEFAULT 0,
  spent DECIMAL(10,2) DEFAULT 0
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE business_context (
  business_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (business_id, key)
);

-- Indexes for performance
CREATE INDEX idx_messages_inbox ON messages(to_agent_id, read, created_at);
CREATE INDEX idx_messages_business ON messages(business_id, created_at);
CREATE INDEX idx_transactions_business ON transactions(business_id, created_at);
```

---

## Configuration

### Server Configuration

```json
{
  "port": 3100,
  "secret_key": "your-hmac-secret-for-message-signing",
  "wake_debounce_ms": 500,
  "agent_inactive_threshold_ms": 30000,
  "max_inbox_size": 1000,
  "max_scheduled_events_per_agent": 20,
  "persistence": "memory",
  "supabase_url": null,
  "supabase_key": null,
  "admin_token": "admin-secret-for-sse-stream",
  "cors_origins": ["http://localhost:3000"]
}
```

### Agent Config Integration (Vibe example)

```toml
# /businesses/vintage-stickers/marketing/.vibe/config.toml

[[mcp_servers]]
name = "swarm"
transport = "http"
url = "http://localhost:3100/swarm?token=session-mkt-abc123"
```

### Agent Config Integration (Generic MCP client)

Any MCP-compatible client can connect to the Swarm Bus. The URL format is:

```
http://localhost:{port}/swarm?token={session_token}
```

The session token is obtained during agent registration.

---

## Implementation Plan

### File Structure

```
/swarm-bus-mcp/
  src/
    server.ts              ← MCP server entry point (HTTP transport + SSE + admin API)
    tools/
      messaging.ts         ← swarm_check_inbox, swarm_send_message, swarm_broadcast, swarm_reply
      escalation.ts        ← swarm_escalate, swarm_decision
      budget.ts            ← swarm_request_budget, swarm_approve_budget, swarm_report_spend, swarm_get_budget
      scheduling.ts        ← swarm_schedule_event, swarm_cancel_event, swarm_list_events
      status.ts            ← swarm_report_status, swarm_get_business_context, swarm_update_business_context
    core/
      store.ts             ← Message store (in-memory + optional Supabase)
      registry.ts          ← Agent registration, org chart management
      router.ts            ← Message routing with hierarchy enforcement
      wake.ts              ← Wake engine (debounced webhook dispatch)
      scheduler.ts         ← Recurring event timer management
      security.ts          ← Identity resolution, hierarchy validation, HMAC signing
      sse.ts               ← SSE event emitter for frontend observability
    api/
      register.ts          ← POST /api/register, /api/deregister
      inject.ts            ← POST /api/inject (external events)
      events.ts            ← GET /api/events/stream (SSE)
      admin.ts             ← GET /api/stats, /api/agents, /api/messages (admin endpoints)
    utils/
      intervals.ts         ← Parse interval strings ('10m' → 600000ms)
      ids.ts               ← ID generation (message IDs, escalation IDs, etc.)
    types.ts               ← Shared TypeScript types
  config/
    default.json           ← Default server configuration
  tests/
    messaging.test.ts
    escalation.test.ts
    budget.test.ts
    scheduling.test.ts
    hierarchy.test.ts
    wake.test.ts
  package.json
  tsconfig.json
  README.md
```

### Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "express": "^4.18.0",
    "uuid": "^9.0.0"
  },
  "optionalDependencies": {
    "@supabase/supabase-js": "^2.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "@types/express": "^4.17.0"
  }
}
```

### Build Priority

| Priority | Component | Estimated Time | Notes |
|----------|-----------|---------------|-------|
| **P0** | MCP server skeleton + tool registration | 1 hour | Get the MCP SDK wired up, tools callable |
| **P0** | Agent registration + identity resolution | 1 hour | Session tokens, role mapping, org chart |
| **P0** | `swarm_check_inbox` + `swarm_send_message` | 1 hour | Core messaging loop |
| **P0** | Hierarchy enforcement | 1 hour | Who can message whom |
| **P0** | Wake engine + webhook dispatch | 1 hour | The orchestration mechanism |
| **P0** | Business isolation | 30 min | Multi-tenant scoping |
| **P1** | `swarm_broadcast` + `swarm_reply` | 30 min | CEO broadcast, threaded replies |
| **P1** | `swarm_escalate` + `swarm_decision` | 1 hour | Structured escalation flow |
| **P1** | `swarm_schedule_event` + `swarm_cancel_event` | 1.5 hours | Recurring timers, business rules |
| **P1** | SSE event emitter | 1 hour | Frontend observability stream |
| **P1** | Budget tools (all 4) | 1.5 hours | Budget tracking, enforcement, transactions |
| **P2** | `swarm_report_status` + context tools | 45 min | Status updates, shared context |
| **P2** | External event injection API | 30 min | Stripe/X webhook → bus |
| **P2** | Admin endpoints (stats, agent list) | 30 min | Admin mosaic support |
| **P2** | HMAC message signing | 30 min | Tamper-proof messages |
| **P3** | Supabase persistence layer | 2 hours | Durability beyond in-memory |
| **P3** | `swarm_list_events`, `swarm_get_budget` | 30 min | Query tools |

**Total estimated build time: ~8 hours for P0+P1, ~12 hours for everything.**

Since this is pre-hackathon work, there's no time pressure. Build P0 first, test thoroughly, add P1, test again. By hackathon day, the Swarm Bus is battle-tested infrastructure.

### Pre-Hackathon Testing Plan

1. **Unit tests for each tool** — mock agent sessions, verify hierarchy enforcement, budget caps, message routing
2. **Integration test: two-agent conversation** — Register CEO + marketing director, exchange messages, verify inbox delivery and wake triggers
3. **Integration test: escalation flow** — Marketing escalates → CEO receives → CEO decides → Marketing receives response
4. **Integration test: scheduled events** — Community manager schedules `time_to_post` every 5 seconds, verify it fires and wakes the agent
5. **Integration test: business isolation** — Two businesses, verify cross-business messaging is impossible
6. **Load test: 20 agents, 5 businesses** — Simulate hackathon conditions, verify no message loss under concurrent load
7. **SSE test** — Subscribe to event stream, fire messages, verify all events arrive in real time

---

## Example: Full Lifecycle

```
1. Backend registers CEO agent:
   POST /api/register { agent_id: "stickers--ceo", business_id: "stickers", role: "ceo", role_type: "ceo", lifecycle: "infinite_loop", parent: null, wake_endpoint: "...", wake_payload: { session_id: "vibe-001" } }
   Backend starts infinite resume loop for CEO.

2. CEO runs a cycle, spawns marketing director, registers it:
   POST /api/register { agent_id: "stickers--marketing-director", business_id: "stickers", role: "marketing-director", role_type: "department_manager", lifecycle: "infinite_loop", parent: "stickers--ceo", wake_endpoint: "...", wake_payload: { session_id: "vibe-002" } }
   Backend starts infinite resume loop for marketing director.

3. CEO sends mission to marketing director:
   swarm_send_message({ to: "marketing-director", content: "Your mission: build brand awareness for Vintage Stickers. Target: developers. Tone: witty, self-aware.", priority: "high" })
   → Bus stores message in marketing-director's inbox
   → Bus does NOT fire wake webhook (marketing director is lifecycle: "infinite_loop" — already running)
   → Marketing director picks up the message on its next cycle (within seconds)

4. Marketing director reads mission, spawns community manager (infinite loop) and copywriter (task-based):
   POST /api/register { ..., role: "community-manager", lifecycle: "infinite_loop", ... }
   POST /api/register { ..., role: "copywriter", lifecycle: "task_based", ... }
   Backend starts infinite resume loop for community manager.
   Copywriter sleeps until woken.

5. Marketing director sends missions:
   swarm_send_message({ to: "community-manager", content: "Own our X presence. Post regularly in brand voice. Engage the community." })
   → Community manager picks it up on next cycle (already running)
   swarm_send_message({ to: "copywriter", content: "Write landing page copy in brand voice. Reference brand-bible.md." })
   → Bus fires wake webhook for copywriter (task_based agent, currently sleeping)
   → Backend re-prompts copywriter → it wakes, does the work, delivers, goes back to sleep

6. Community manager grinds continuously:
   → Posts first tweet, analyzes engagement, drafts more content
   → Proactively creates todos: "Check mentions", "Draft thread about dev culture"
   → Reports to marketing director: "First tweet posted. Engagement tracking started."
   → On next cycle: checks inbox, clears todos, goes back to mission, creates more work
   → Never stops. Never idles.

7. Marketing director grinds continuously:
   → Reviews community manager's output, sends feedback
   → Proactively develops growth strategy, researches competitor positioning
   → Reports to CEO with aggregated insights
   → Creates new todos: "Research viral meme formats", "Plan content calendar"

8. CEO grinds continuously:
   → Reviews all department reports, synthesizes for founder
   → Proactively assesses budget allocation, considers pricing changes
   → Checks if new departments or specialists are needed
   → Updates founder on milestones

9. External event: Stripe webhook fires (someone bought a sticker).
   POST /api/inject { business_id: "stickers", target_role: "finance-specialist", event_type: "stripe_payment", content: "New sale: $4.99" }
   → If finance specialist is infinite_loop: message waits in inbox, picked up on next cycle
   → If finance specialist is task_based: wake webhook fires, specialist wakes and processes
   → Finance specialist updates P&L → reports to CEO → CEO tells user: "First sale!"

10. The swarm is always alive. Every node is always working. The graph never goes dark.
```

---

## Open Source Packaging

### Repository: `swarm-bus-mcp`

**README structure:**
- What it is (multi-agent communication MCP server)
- Quick start (npm install, configure, register agents, start messaging)
- Architecture diagram
- Two lifecycle models (infinite loop agents vs task-based agents with wake webhooks)
- Full tool reference
- Security model
- Configuration options
- Examples with Vibe, Claude Code, and generic MCP clients

**License:** MIT — maximum adoption, no friction.

**Key selling points for the community:**
- Drop-in multi-agent communication for any MCP runtime
- Supports both always-running agents (infinite resume loop) and sleeping agents (event-driven wake)
- Built-in hierarchy enforcement and multi-tenancy
- Real-time observability via SSE
- Works with Vibe, Claude Code, Cursor, or any MCP client
