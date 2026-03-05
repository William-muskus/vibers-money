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

The Orchestrator creates the workspace, **writes AGENTS.md and config.toml** from the mission and role, copies skills, and starts the agent. You do not write AGENTS.md yourself.

**Before spawning**, call `mcp_swarm_list_agents` to see who is already running — do not spawn a role that already exists. After spawning, wait for the agent to appear in `mcp_swarm_list_agents` before sending them messages.

## Convention (same tool for CEO and directors)
- **CEO**: Spawn exactly five directors in order: Security Director first, then CTO, then Marketing, Product, Finance. Do not spawn specialists — that is the directors' job.
- **Department managers**: Spawn your own specialists (e.g. Community Manager, Copywriter) with a clear mission and **macro_objectives**.
- One skill, one tool; who spawns whom is convention, not a different API.
