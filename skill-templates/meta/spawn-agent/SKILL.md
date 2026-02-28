# Spawn Agent (meta-skill)

## When to use
- You need to delegate ongoing work to a new agent (department manager or specialist).
- The work requires its own workspace, MCP access, and autonomous work cycles.

## How to use
Call the MCP tool **`mcp_swarm_spawn_agent`** with:

- **role**: Role name (e.g. `community-manager`, `marketing-director`, `security-director`).
- **business**: Business ID (must match your business).
- **mission**: Clear mission statement for the new agent (what they own, goals, constraints).
- **browser_domains** (optional): Domains the agent may use with Computer Use MCP (e.g. `["x.com", "twitter.com"]`). Request approval via Security Director if unsure.
- **skills** (optional): Skill names to seed in the agent's workspace (from shared or meta).
- **lifecycle** (optional): `infinite_loop` (default) or `task_based`.

The Swarm Bus forwards the request to the Orchestrator, which creates the workspace, writes AGENTS.md and config.toml, copies skills, and launches the Vibe process. The new agent will appear in the org and can receive messages from you via `swarm_send_message`.

## Convention
- CEO spawns Security Director first, then department managers (Marketing, Product, Finance, etc.), then specialists as needed.
- Department managers spawn their own specialists (e.g. Community Manager, Copywriter).
- Always send a mission brief to the new agent via `swarm_send_message` after they are online.
