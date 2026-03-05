---
name: add-mcp
description: Security Director only. Approve and add a new MCP server or grant new domain access after evaluating a request. Document decision and coordinate with platform/orchestrator if needed.
---

# Add MCP (meta-skill, Security Director)

## When to use
- You receive an MCP or domain **request** from an agent (via Swarm Bus) and you have decided to **approve** it.
- You need to add a new MCP server block or grant browser domain access for one or more agents.
- You are the **Security Director**; only you (or the platform) should perform this action.

## How to use
1. **Evaluate the request**: Check service URL, domain, and justification. Deny if it increases prompt-injection or exfiltration risk; approve only what is necessary for the mission.
2. **If approving a new MCP server**: Document the decision (e.g. in business context or a security log). Coordinate with the platform or orchestrator to add the MCP block to agent config (e.g. new template or config endpoint). Notify the requestor via Swarm Bus that the MCP is now available and how to use it.
3. **If approving new browser domains**: Domains are often passed at spawn time (`browser_domains`). You can reply to the requestor with approval and instruct them (or the CEO) to spawn or re-provision the agent with the new domains, or use any platform API that updates an agent's allowed domains. Notify the requestor when access is granted.
4. **If denying**: Reply via Swarm Bus with a short reason and, if possible, a safer alternative.

## Convention
- Only Security Director (or platform automation) adds MCPs or grants domain access. Other agents use **request-mcp** only.
- Log approvals and denials for audit. Keep a record of which agents have which MCP and domain access.
