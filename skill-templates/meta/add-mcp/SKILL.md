# Add MCP (meta-skill)

## When to use
- You need to connect to a new MCP server that isn't already in your `.vibe/config.toml`.
- Swarm Bus and Computer Use are pre-configured; this skill is for additional services (e.g. custom APIs, data sources).

## How to use
1. **Do not edit config.toml directly** for MCP servers that touch the network or external domains. Those require Security Director approval.
2. If you need a new **domain or external service**:
   - Escalate to the Security Director (or CEO) via Swarm Bus: describe the service, URL, and why you need it.
   - If approved, the Orchestrator or Security Director will add the MCP block and headers; you will be notified.
3. If you need a **local or internal** MCP (e.g. a tool that only reads from a shared knowledge path):
   - Document the request in your workspace (e.g. in `decisions/` or a note).
   - The platform may support adding approved internal MCPs via config template updates in a future release.

## Convention
- Swarm Bus and Computer Use MCP are already configured with your agent identity (X-Agent-Id, X-Business-Id). Use them for messaging and browser automation.
- For any new external MCP, always go through the Security Director to avoid prompt injection or data exfiltration risks.
