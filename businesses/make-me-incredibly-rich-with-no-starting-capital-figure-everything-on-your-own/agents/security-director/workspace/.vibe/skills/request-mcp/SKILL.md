---
name: request-mcp
description: Request a new MCP server or new browser domain access. For CEO and all agents. Escalate to Security Director with service, URL, and justification; do not edit config yourself.
---

# Request MCP (shared skill)

## When to use
- You need to connect to a new MCP server that isn't already available (e.g. custom API, data source).
- You need access to a new **browser domain** for Computer Use (e.g. a site not on your approved list).
- Swarm Bus and Computer Use are pre-configured; use this skill for anything additional.

## How to use (CEO and all agents)
1. **Do not edit `.vibe/config.toml` yourself** for network or external services. That is the Security Director's responsibility.
2. Send a **request to the Security Director** via Swarm Bus (`mcp_swarm_send_message` to `security-director` or your manager who will escalate):
   - **What**: Service name, URL or domain, and what you need it for.
   - **Why**: Brief justification (e.g. "Need to post to our Twitter; request x.com for Marketing Director").
3. If the Security Director approves, they will add the MCP or domain (add-mcp / edit-mcp-access skills) and notify you. You can then use the new capability when it is enabled for your role.
4. For **local or internal** needs (e.g. read-only tool on a shared path), document the request in your workspace; the platform may support internal MCPs via template updates.

## Convention
- All external MCP and domain requests go through the Security Director to reduce prompt injection and data exfiltration risk.
- CEO can request on behalf of the org; other agents request for their own work or their reports.
