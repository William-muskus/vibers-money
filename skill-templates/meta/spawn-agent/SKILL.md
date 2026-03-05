---
name: spawn-agent
description: Spawn a new agent. CEO uses this to spawn the five department directors. Department managers use this to spawn specialists (always-on or on-call). Uses mcp_swarm_spawn_agent.
---

# Spawn Agent (meta-skill)

The Orchestrator handles everything after you call the tool: it creates the agent's workspace, generates their `AGENTS.md` and `config.toml` from the mission and role, copies skills, registers them in the Swarm Bus, and starts the process. You only need to call `mcp_swarm_spawn_agent`.

---

## Before spawning (always)

Call `mcp_swarm_list_agents` first. Do not spawn a role that is already in the list.
After spawning, poll `mcp_swarm_list_agents` until the new agent appears before sending them any messages.

---

## If you are the CEO — spawning department directors

Spawn exactly **five directors**, in this order:

1. **Security Director** — first always; owns credentials, email setup, access policies
2. **CTO** — technical architecture, engineering org
3. **Marketing Director** — brand, content, community
4. **Product Director** — roadmap, UX, specs
5. **Finance Director** — budget, financial planning

**Rules:**
- Always use `lifecycle: "infinite_loop"` for directors — they run continuously.
- Do **not** spawn specialists yourself. That is each director's responsibility.
- Pass `macro_objectives` to each director as a todo list of 5 objectives to focus on.

```
mcp_swarm_spawn_agent({
  role: "security-director",
  business: "<your_business_id>",
  mission: "Own all security, credentials, and identity for the business. ...",
  macro_objectives: [
    "Keep the business safe and secure",
    "Manage access control policy for all agents",
    "Ensure there is no security flaws in everything that is pushed to prod"
  ],
  lifecycle: "infinite_loop"
})
```

---

## If you are a department manager — spawning specialists

You choose the right lifecycle for each specialist based on their working pattern.

### Always-on specialist (`infinite_loop`)
Use for roles that work continuously in parallel with you — they run their own work cycle indefinitely.

Examples: Community Manager, Full-stack developer, ML researcher, DevOps Engineer, ...

```
mcp_swarm_spawn_agent({
  role: "community-manager",
  business: "<your_business_id>",
  mission: "Own the Twitter/X presence. Post daily, engage with the audience, grow followers.",
  macro_objectives: [
    "Create and set up the business Twitter/X account",
    "Post 3 tweets per day aligned with brand voice",
    "Grind as a replay guy with relevant accounts and posts all day long"
  ],
  browser_domains: ["x.com", "twitter.com"],
  lifecycle: "infinite_loop"
})
```

### On-call specialist (`task_based`)
Use for roles brought in to complete a specific piece of work, then idle until woken again. They do not run a continuous loop — they wake, complete one task, and stop.

Examples: Legal Reviewer, Security Auditor, Data Analyst, Content writer, UX/UI designer, business analyst, front-end developper, ...

```
mcp_swarm_spawn_agent({
  role: "legal-reviewer",
  business: "<your_business_id>",
  mission: "Review legal documents and contracts when requested. Flag risks, suggest edits.",
  macro_objectives: [
    "Review the founder agreement draft and return annotated feedback",
    "Identify any compliance gaps in the privacy policy"
  ],
  lifecycle: "task_based"
})
```

After spawning a task_based specialist, send them a message via `mcp_swarm_send_message` describing the specific task. They will wake, execute, and report back.

---

## Full parameter reference

| Parameter | Required | Description |
|---|---|---|
| `role` | Yes | Role name, e.g. `community-manager`, `cto` |
| `business` | Yes | Your business ID |
| `mission` | Yes | 2–4 sentence brief: what they own, goals, constraints |
| `macro_objectives` | **Yes** | Array of 3–5 concrete outcomes — used by the agent to self-configure and build their initial todo list |
| `browser_domains` | No | Domains the agent may browse (e.g. `["x.com"]`). Requires Security Director approval for new domains. |
| `skills` | No | Extra skill names to copy into the agent's workspace |
| `lifecycle` | No | `"infinite_loop"` (default) or `"task_based"` |
