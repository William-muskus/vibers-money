---
name: spawn-agent
description: Spawn a new agent (director or specialist). Use mcp_swarm_spawn_agent with role, business, mission, and required macro_objectives. CEO and department managers only.
---

# Spawn Agent (meta-skill)

## When to use
- You need to delegate ongoing work to a new agent (department manager or specialist).
- The work requires its own workspace, MCP access, and autonomous work cycles.

## How to use
Call the MCP tool **`mcp_swarm_spawn_agent`** with:

- **role**: Role name (e.g. `security-director`, `cto`, `marketing-director`, `product-director`, `finance-director`, `community-manager`).
- **business**: Business ID (must match your business).
- **mission**: Clear mission statement (what they own, goals, constraints).
- **macro_objectives** (required): JSON array of 3–5 concrete outcomes (e.g. `["Define security policy", "Draft first content calendar"]`). The new agent uses these to self-configure and build their initial todo list. Always pass this when spawning.
- **browser_domains** (optional): Domains for Computer Use (e.g. `["x.com"]`). Request Security Director approval if unsure.
- **skills** (optional): Skill names to seed (from shared or meta).
- **lifecycle** (optional): `infinite_loop` (default) or `task_based`.

The Orchestrator creates the workspace, **writes AGENTS.md and config.toml** from the mission and role, copies skills, and starts the agent. You do not write AGENTS.md yourself. You can only send messages to an agent after they are spawned and running — spawn all five directors first, then use `mcp_swarm_send_message` for welcome or briefs if needed.

## Convention (same tool for CEO and directors)
- **CEO**: Spawn all five directors in order: Security Director first, then CTO, then Marketing, Product, and Finance Directors. Pass mission + **macro_objectives** so they self-configure and create their initial task list. Only after they are running can you message them. Then spawn specialists as needed.
- **Department managers**: Spawn your specialists (e.g. Community Manager, Copywriter) with a clear mission and **macro_objectives** (required) for their first-cycle task list.
- One skill, one tool; who spawns whom is convention, not a different API.
