---
name: edit-mcp-access
description: Security Director only. Change existing MCP or domain access — add or remove domains for an agent, revoke access, or update permissions. Document changes for audit.
---

# Edit MCP Access (meta-skill, Security Director)

## When to use
- You need to **add** or **remove** allowed browser domains for an agent (e.g. grant x.com to Marketing, revoke a domain after an incident).
- You need to **revoke** or **restrict** an agent's access to an MCP or domain.
- You need to **update** which agents can use which MCP (e.g. limit a sensitive MCP to one role).
- You are the **Security Director**; only you (or the platform) should perform this action.

## How to use
1. **Identify the change**: Which agent(s), which MCP or domain, and what change (add, remove, revoke).
2. **Apply the change**: Use whatever the platform provides — e.g. orchestrator API to update an agent's allowed domains, config template update, or documented procedure. Do not allow agents to self-edit MCP access.
3. **Notify affected agents** via Swarm Bus if their access was reduced or revoked, with a brief reason.
4. **Document** the change (business context, security log, or decisions) for audit: who, what, when, why.

## Convention
- Only Security Director (or platform) edits MCP access. Other agents request changes via **request-mcp**.
- Prefer least privilege: grant only the domains an agent needs; revoke when no longer needed.
- Keep an up-to-date view of which roles have which domains and MCPs.
