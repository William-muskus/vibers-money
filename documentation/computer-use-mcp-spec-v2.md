# Appendix A: Computer Use MCP Server — Technical Specification v2

## Overview

Every agent in vibers.money is a **Mistral Vibe workspace** — a real shell with compute, filesystem access, and MCP tool connectivity. Agents don't live inside virtual machines. They don't need them. Vibe already provides everything an agent needs to operate: `bash` for executing commands, `read_file`/`write_file` for filesystem work, `grep` for code search, `--workdir` for directory scoping, `--auto-approve` for autonomous execution, `--resume` for session persistence, and `--output streaming` for real-time observability.

The **Computer Use MCP server** extends every Vibe workspace with browser capability. Any agent — CEO, community manager, copywriter, any of them — can call browser tools at any moment to see a webpage, click elements, type text, and navigate the web. The next moment that same agent is back in its terminal writing files. Browser use is not a role. It's a capability available to all agents through MCP.

### What This Spec Covers

1. **Browser capability via MCP** — annotated screenshots with numbered elements, click/type/drag with human-like timing, captcha solving via vision, domain allowlisting per agent
2. **Live observability** — every agent's activity is streamed to an admin mosaic. Each tile dynamically shows what the agent is doing *right now*: terminal output when it's working in the shell, live browser screencast when it's navigating a website. The tile switches seamlessly as the agent's activity changes.
3. **Agent spawning** — how the CEO agent creates new agent workspaces as Vibe processes, each with their own workdir, config, MCP connections, and persistent session
4. **The full architecture** — no VMs, no containers, no Firecracker. Just Vibe processes on a Linux server with shared MCP infrastructure.

### Using computer use on your own machine

Computer use drives **one Chrome instance** via the Chrome DevTools Protocol (CDP). That Chrome can run on the same machine as the orchestrator (e.g. your dev PC) or on another host.

- **Same machine (typical):** Run Chrome with remote debugging on your PC, then run the computer-use-mcp server and orchestrator on the same PC. Agents will control that browser. Example:
  - Windows: `chrome.exe --remote-debugging-port=9222`
  - macOS/Linux: `google-chrome --remote-debugging-port=9222` (or your Chromium path)
  - Start the computer-use-mcp server (default: connects to `localhost:9222`). Agents then drive this Chrome.
- **Chrome on another machine:** If Chrome runs on a different host (e.g. your laptop at `192.168.1.10`), set `CDP_HOST=192.168.1.10` (and optionally `CDP_PORT=9222`) in the environment where the computer-use-mcp server runs. The server will connect to that Chrome. Ensure the debugging port is reachable (firewall, no `--remote-debugging-address=127.0.0.1` so it listens on all interfaces if needed).

Note: computer use is **browser-only** (navigate, click, type in Chrome). It does not control your full desktop (mouse/keyboard outside the browser).

### Why No VMs

Vibe already provides:

| Capability | Vibe provides | VM would add |
|-----------|--------------|-------------|
| Shell / compute | `bash` tool — full stateful terminal | A second shell wrapping the first |
| Filesystem | `read_file`, `write_file`, `search_replace` | A second filesystem wrapping the first |
| Directory isolation | `--workdir` scopes to agent's directory | Kernel-level isolation (overkill for hackathon) |
| Process persistence | `--resume` with session ID | VM snapshot/restore |
| MCP connectivity | Native `[[mcp_servers]]` in config.toml | Network bridge to reach MCP on host |
| Cost controls | `--max-price`, `--max-turns` | Resource limits via cgroups |
| Streaming output | `--output streaming` | Console capture |

A VM wraps an already-complete compute environment inside another compute environment. The only thing VMs add is hardware-level isolation — important for production multi-tenant security, unnecessary for a hackathon demo. For production, we can add Linux namespaces or containers around Vibe processes later without changing any agent code or MCP interfaces.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Host Server (Ubuntu, 16-32GB RAM)                                       │
│                                                                          │
│  ┌─────── Shared Infrastructure ──────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  Xvfb :99 ──► Chrome (single instance, many tabs) ──► CDP :9222   │  │
│  │                      ~400MB total, shared across ALL agents        │  │
│  │                                                                    │  │
│  │  Computer Use MCP Server  (HTTP :3200)                             │  │
│  │    • Annotation engine (DOM query + overlay rendering)             │  │
│  │    • Input dispatcher (human-like cursor, keystrokes, drag)        │  │
│  │    • Tab manager (per-agent tab ownership)                         │  │
│  │    • Screencast manager (CDP → SSE browser frames)                 │  │
│  │    • Activity tracker (terminal ↔ browser mode per agent)          │  │
│  │                                                                    │  │
│  │  Swarm Bus MCP Server  (HTTP :3100)                                │  │
│  │    • Agent registry, message routing, wake engine                  │  │
│  │                                                                    │  │
│  │  Orchestrator  (HTTP :3000)                                        │  │
│  │    • Spawns/kills Vibe processes on demand                         │  │
│  │    • Captures terminal output per agent                            │  │
│  │    • Serves unified SSE activity streams to frontend               │  │
│  │    • Serves admin mosaic frontend                                  │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─────── Agent Processes (Vibe workspaces) ──────────────────────────┐  │
│  │                                                                    │  │
│  │  vibe ── vintage-stickers/ceo/          (PID 1001)                 │  │
│  │  vibe ── vintage-stickers/community/    (PID 1002)                 │  │
│  │  vibe ── vintage-stickers/marketing/    (PID 1003)                 │  │
│  │  vibe ── vintage-stickers/copywriter/   (PID 1004)                 │  │
│  │  vibe ── vintage-stickers/security/     (PID 1005)                 │  │
│  │  vibe ── vintage-stickers/frontend/     (PID 1006)                 │  │
│  │  vibe ── vintage-stickers/backend/      (PID 1007)                 │  │
│  │  vibe ── vintage-stickers/analytics/    (PID 1008)                 │  │
│  │  ...                                                               │  │
│  │  vibe ── ai-wallpapers/ceo/             (PID 2001)                 │  │
│  │  vibe ── ai-wallpapers/community/       (PID 2002)                 │  │
│  │  ...                                                               │  │
│  │                                                                    │  │
│  │  Each: ~50-60MB RAM (Python + Vibe runtime)                        │  │
│  │  Each: own workdir, own .vibe/config.toml, own session             │  │
│  │  Each: connects to shared MCP servers over HTTP                    │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─────── Frontend ──────────────────────────────────────────────────┐   │
│  │                                                                    │  │
│  │  Admin Mosaic (presenter's browser)                                │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │  │
│  │  │ CEO      │ │ Comm.Mgr │ │ Marketing│ │ Frontend │             │  │
│  │  │ terminal │ │ BROWSER  │ │ terminal │ │ terminal │             │  │
│  │  │ writing  │ │ posting  │ │ analyzing│ │ coding   │             │  │
│  │  │ plan...  │ │ on x.com │ │ comps... │ │ site...  │             │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │  │
│  │  │ Security │ │ Backend  │ │ Copywrtr │ │Analytics │             │  │
│  │  │ terminal │ │ terminal │ │ terminal │ │ BROWSER  │             │  │
│  │  │ auditing │ │ building │ │ drafting │ │ checking │             │  │
│  │  │ perms... │ │ API...   │ │ tweets.. │ │ GA dash..│             │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘             │  │
│  │                                                                    │  │
│  │  Each tile: dynamically terminal OR browser based on activity      │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Orchestrator** — the new component. The Orchestrator is the process manager for the entire system. It:
- Receives "spawn agent" requests from the Swarm Bus (triggered by CEO agents)
- Creates the agent's workdir, writes its `.vibe/config.toml` and system prompt
- Launches the Vibe process as a child subprocess
- Captures the Vibe process's stdout/stderr into a per-agent scrollback buffer
- Exposes a unified SSE endpoint per agent that multiplexes terminal output and browser activity mode
- Handles agent process lifecycle (restart on crash, kill on business shutdown)

**Computer Use MCP** — browser capability. Provides annotated screenshots, click/type/drag, tab management, screencast streaming. Agents connect to it via `[[mcp_servers]]` in their Vibe config.

**Swarm Bus MCP** — inter-agent communication. Message routing, agent registry, wake engine for task-based agents.

---

## Agent Workspace Structure

### Directory Layout

Each agent's workspace is a full Vibe project — it follows Vibe's conventions for config, prompts, skills, and the `AGENTS.md` file that gives the agent its identity and context.

```
/opt/vibers/businesses/
  vintage-stickers/
    knowledge/                          ← shared business knowledge base (read-only bind mount)
      business-plan.md
      brand-guidelines.md
      credentials.md                    ← encrypted, access controlled
    
    agents/
      ceo/
        workspace/                      ← THE WORKDIR — Vibe runs here
          AGENTS.md                     ← WHO AM I: role, mission, conventions, team structure
          .vibe/
            config.toml                 ← MCP servers, model, tool permissions
            .env                        ← MISTRAL_API_KEY
            prompts/
              system.md                 ← system prompt (referenced by config.toml)
            skills/                     ← role-specific skills
              spawn-agent/
                SKILL.md                ← how to spawn a new team member
              write-business-plan/
                SKILL.md                ← business plan template + process
              review-status/
                SKILL.md                ← how to request status from all departments
          .agents/
            skills/                     ← Agent Skills standard path (alternative)
          notes/
          decisions/
      
      community-manager/
        workspace/                      ← THE WORKDIR
          AGENTS.md                     ← role, mission, posting guidelines, brand voice
          .vibe/
            config.toml
            .env
            prompts/
              system.md
            skills/
              post-tweet/
                SKILL.md                ← step-by-step: open x.com, compose, post, verify
              engage-followers/
                SKILL.md                ← how to find and reply to relevant conversations
              check-analytics/
                SKILL.md                ← how to pull engagement metrics
              check-messages/
                SKILL.md                ← poll Swarm Bus for new messages from team
          drafts/
          scheduled-posts.md
      
      security-director/
        workspace/
          AGENTS.md
          .vibe/
            config.toml
            .env
            prompts/
              system.md
            skills/
              review-access-request/
                SKILL.md                ← how to evaluate domain access requests
              audit-agent-activity/
                SKILL.md                ← how to review agent browser history
          access-log.md
          approved-domains.md
      
      frontend-builder/
        workspace/
          AGENTS.md
          .vibe/
            config.toml
            .env
            skills/
              scaffold-site/
                SKILL.md
              deploy-preview/
                SKILL.md
          src/
          package.json
      
      ... (marketing-director, copywriter, backend-builder, analytics)
```

### AGENTS.md — The Agent's Identity

Vibe reads `AGENTS.md` from the workspace root on every session. This is how each agent knows who it is, what it can do, and how to operate. It's the single most important file in the workspace.

Example for the Community Manager:

```markdown
# Community Manager — Vintage Stickers

## Role
You are the Community Manager for Vintage Stickers, an AI-operated sticker business.
You own the brand's presence on X (Twitter).

## Mission
Build and grow our community. Post engaging content daily. Reply to followers.
Track engagement metrics. Report weekly to the Marketing Director.

## Team
- Your manager: **Marketing Director** (report status via Swarm Bus)
- Your CEO: **CEO** (escalate blockers)
- Your Security Director: **Security Director** (request new domain access)
- Peers: Copywriter (request copy), Frontend Builder (coordinate launches)

## Tools Available
- **Swarm Bus MCP** (`mcp_swarm_*`): Send/receive messages to other agents
- **Computer Use MCP** (`mcp_computer_*`): Browse the web (approved domains: x.com, twitter.com)
- **bash**: Run shell commands in your workspace
- **read_file / write_file**: Manage your files

## Conventions
- Always draft tweets in `drafts/` before posting
- Log all posted tweets in `scheduled-posts.md` with timestamp and URL
- Check Swarm Bus messages at the start of every work cycle
- Use the `post-tweet` skill for the full posting workflow
- Never post without reviewing the brand guidelines in `../../../knowledge/brand-guidelines.md`

## Browser Domains
You have approved access to: x.com, twitter.com
For any other domain, request access from the Security Director via Swarm Bus.

## Work Cycle
1. Check messages from Swarm Bus
2. Read any new directives from Marketing Director
3. Review brand guidelines if updated
4. Draft and post content
5. Engage with followers (reply, like, retweet)
6. Check analytics
7. Report to Marketing Director
```

Vibe automatically includes this in the system prompt context. The agent doesn't need to be told "you are the community manager" in a separate prompt — it reads it from its own workspace.

### Skills — Executable Knowledge

Skills are reusable step-by-step instructions that the agent can invoke. They're markdown files with YAML frontmatter, discovered automatically by Vibe from `.vibe/skills/` or `.agents/skills/`.

Example: `post-tweet` skill for the Community Manager:

```markdown
---
name: post-tweet
description: Compose and post a tweet on X (Twitter)
user-invocable: false
allowed-tools:
  - mcp_computer_navigate
  - mcp_computer_screenshot
  - mcp_computer_click
  - mcp_computer_type
  - mcp_swarm_send_message
  - write_file
---

# Post Tweet Workflow

## Steps

1. Read the draft from `drafts/` or compose based on current directive
2. Navigate to x.com: `mcp_computer_navigate({ url: "https://x.com" })`
3. Take screenshot to see the current state: `mcp_computer_screenshot()`
4. Click the compose area (look for "What's happening?" input)
5. Type the tweet text with `mcp_computer_type({ text: "..." })`
6. Review: take another screenshot to verify the text looks correct
7. Click the Post button
8. Take a final screenshot to confirm the tweet was posted
9. Log the tweet in `scheduled-posts.md`:
   ```
   ## [date] [time]
   Tweet: [content]
   Status: posted
   ```
10. Notify Marketing Director via Swarm Bus:
    `mcp_swarm_send_message({ to: "marketing-director", content: "Tweet posted: [content]" })`

## Error Handling
- If captcha appears, solve it using vision (identify correct images, click them)
- If post fails, retry once. If still failing, report to Marketing Director.
- If logged out, re-authenticate using credentials from knowledge base.
```

Example: `check-messages` skill (shared across all agents):

```markdown
---
name: check-messages
description: Check for new messages from other agents via Swarm Bus
user-invocable: false
allowed-tools:
  - mcp_swarm_get_messages
  - mcp_swarm_send_message
---

# Check Messages

1. Call `mcp_swarm_get_messages()` to fetch unread messages
2. For each message:
   - If it's a directive from your manager: prioritize it in your current work cycle
   - If it's a status request: prepare and send a status update
   - If it's an access request (and you're Security Director): evaluate and respond
   - If it's a question from a peer: respond with relevant information
3. Acknowledge each message after processing
```

Example: `spawn-agent` skill (CEO only):

```markdown
---
name: spawn-agent
description: Create a new agent to join the team
user-invocable: false
allowed-tools:
  - mcp_swarm_spawn_agent
  - mcp_swarm_send_message
  - write_file
---

# Spawn Agent

## Before spawning
1. Review the business plan to determine what roles are needed
2. Check current team roster via `mcp_swarm_list_agents()`
3. Don't duplicate existing roles

## Spawning
Call `mcp_swarm_spawn_agent` with:
- `role`: the agent's role (e.g., "community-manager", "frontend-builder")
- `mission`: clear description of what this agent should accomplish
- `browser_domains`: list of domains this agent needs (will be reviewed by Security Director)
- `skills`: list of skill categories to install

## After spawning
1. Send the new agent a welcome message via Swarm Bus with initial directives
2. If browser access was requested, check that Security Director approved it
3. Log the new agent in your `notes/team-roster.md`
```

### Agent Config Template

Each agent's `.vibe/config.toml`:

```toml
# /opt/vibers/businesses/vintage-stickers/agents/community-manager/workspace/.vibe/config.toml

active_model = "devstral-2"
system_prompt_id = "system"

# CRITICAL: Disable auto-update — agents must not try to update themselves mid-operation
enable_auto_update = false

# Disable telemetry in autonomous mode
enable_telemetry = false

# Auto-approve all tool use — agent runs autonomously
auto_approve = true

[tools.bash]
permission = "always"

[tools.write_file]
permission = "always"

[tools.read_file]
permission = "always"

# Enable role-specific skills + shared skills
enabled_skills = ["post-tweet", "engage-followers", "check-analytics", "check-messages", "report-status"]

# Also discover shared skills from the global template library
skill_paths = ["/opt/vibers/skill-templates/shared"]

# Computer Use MCP — browser capability (streamable-http for large screenshot responses)
[[mcp_servers]]
name = "computer"
transport = "streamable-http"
url = "http://localhost:3200"
headers = { "X-Agent-Id" = "community-manager", "X-Business-Id" = "vintage-stickers" }
tool_timeout_sec = 30

# Swarm Bus MCP — inter-agent communication
[[mcp_servers]]
name = "swarm"
transport = "http"
url = "http://localhost:3100"
headers = { "X-Agent-Id" = "community-manager", "X-Business-Id" = "vintage-stickers" }
tool_timeout_sec = 15
```

**Key config fields:**
- `enable_auto_update = false` — prevents Vibe from self-updating mid-task. Without this, an agent could pause to download an update.
- `enable_telemetry = false` — disables usage data collection. Our agents generate millions of tool calls.
- `skill_paths` — points to shared skill template directory. Agents discover skills from both `.vibe/skills/` (role-specific) AND this shared path, avoiding duplication.
- `transport = "streamable-http"` — for Computer Use MCP. Better for large responses like base64 screenshots. Regular `http` also works.
- Agent identity via `headers` — HTTP headers (`X-Agent-Id`, `X-Business-Id`) instead of `env`. The `env` field is designed for stdio transport; headers are guaranteed to arrive with every HTTP request.

MCP tool names in Vibe follow the pattern `mcp_{server_name}_{tool_name}`: `mcp_computer_screenshot`, `mcp_computer_click`, `mcp_swarm_send_message`, etc. Tool permissions can be set per-MCP-tool:

```toml
# Example: require approval for navigate specifically
[tools.mcp_computer_navigate]
permission = "ask"
```

### How Skills Get Created

Skills are not all pre-written. The initial set comes from skill templates that the Orchestrator installs when spawning an agent. But agents can **create and modify their own skills** — they have `write_file` access to their `.vibe/skills/` directory. An agent that discovers a reliable workflow for a task can codify it as a new skill for future work cycles.

The CEO's `spawn-agent` skill includes a `skills` parameter that tells the Orchestrator which skill templates to install. The Orchestrator maintains a library of templates:

```
/opt/vibers/skill-templates/
  shared/
    check-messages/SKILL.md           ← installed for every agent
    report-status/SKILL.md            ← installed for every agent
  community-manager/
    post-tweet/SKILL.md
    engage-followers/SKILL.md
    check-analytics/SKILL.md
  frontend-builder/
    scaffold-site/SKILL.md
    deploy-preview/SKILL.md
  security-director/
    review-access-request/SKILL.md
    audit-agent-activity/SKILL.md
  ceo/
    spawn-agent/SKILL.md
    write-business-plan/SKILL.md
    review-status/SKILL.md
```

When the CEO spawns a community manager, the Orchestrator copies `shared/*` + `community-manager/*` skills into the new agent's `.vibe/skills/` directory. The agent immediately has executable knowledge for its role.

### Agent Launch

The Orchestrator spawns each agent as a Vibe subprocess. The `--workdir` points to the workspace directory, which contains the `AGENTS.md`, `.vibe/config.toml`, and skills. Vibe reads all of these on startup.

```bash
VIBE_HOME="/opt/vibers/businesses/vintage-stickers/agents/community-manager/workspace/.vibe" \
MISTRAL_API_KEY="sk-..." \
vibe \
  --workdir /opt/vibers/businesses/vintage-stickers/agents/community-manager/workspace \
  --prompt "Continue." \
  --auto-approve \
  --output streaming \
  --resume "vintage-stickers--community-manager" \
  --max-turns 100 \
  --max-price 1.00
```

Key flags:
- `VIBE_HOME` — scopes all Vibe config to this agent's `.vibe/` directory. Prevents agents from sharing global `~/.vibe/`.
- `--workdir` — the agent's workspace root. Contains `AGENTS.md` (identity), `.vibe/` (config + skills), and all working files. Vibe auto-scans this on startup for project context.
- `--auto-approve` — no human approval needed for tool calls. Agent runs autonomously.
- `--output streaming` — emits **newline-delimited JSON** (NDJSON) to stdout. Each line is a structured message:
  ```
  {"type":"system","subtype":"init",...}
  {"role":"assistant","content":"Let me check the Swarm Bus for messages...",...}
  {"type":"tool_use","name":"mcp_swarm_get_messages",...}
  {"type":"tool_result",...}
  {"type":"result","usage":{...},"duration_ms":1634,"total_cost_usd":0.003}
  ```
  This is NOT raw terminal ANSI output. The Orchestrator parses these JSON lines to render structured activity in the frontend (tool calls, reasoning, results). This is actually better than raw terminal — we get semantic understanding of what the agent is doing.
- `--max-turns 100` — caps the number of assistant turns per session. Prevents runaway loops.
- `--max-price 1.00` — caps the session cost in dollars. Prevents cost explosions.
- `--enabled-tools` — (optional) restricts which tools the agent can use. Powerful for security: launch the Security Director with `--enabled-tools "read_file" "grep" "mcp_swarm_*"` to prevent bash access.
- `--resume` — continues from the previous session. Session ID is the agent's unique key.

On startup, Vibe:
1. Reads `.vibe/config.toml` → connects to Computer Use MCP + Swarm Bus MCP
2. Reads `AGENTS.md` → understands its role, mission, team, conventions
3. Discovers `.vibe/skills/` → loads available skills (post-tweet, check-messages, etc.)
4. Resumes session → picks up where it left off
5. Receives prompt "Continue." → enters next work cycle

### Infinite Resume Loop

The Orchestrator wraps each Vibe process in a restart loop:

```javascript
class AgentProcess {
  constructor(agentId, businessId, config) {
    this.agentId = agentId;
    this.businessId = businessId;
    this.key = `${businessId}--${agentId}`;
    this.config = config;
    this.activityLog = new RingBuffer(500);  // Last 500 structured events
    this.mode = 'terminal';
    this.subscribers = new Set();
    this.lastBrowserToolTime = 0;
  }

  async start() {
    while (this.running) {
      const workdir = `/opt/vibers/businesses/${this.businessId}/agents/${this.agentId}/workspace`;
      const vibeHome = `${workdir}/.vibe`;

      this.process = spawn('vibe', [
        '--workdir', workdir,
        '--prompt', 'Continue.',
        '--auto-approve',
        '--output', 'streaming',
        '--resume', this.key,
        '--max-turns', '100',
        '--max-price', '1.00'
      ], {
        env: {
          ...process.env,
          VIBE_HOME: vibeHome,
          MISTRAL_API_KEY: this.config.apiKey
        }
      });

      // Parse NDJSON stdout — each line is a structured JSON message
      let lineBuffer = '';
      this.process.stdout.on('data', (chunk) => {
        lineBuffer += chunk.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop();  // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            this.handleMessage(msg);
          } catch (e) {
            // Non-JSON output (rare) — treat as raw text
            this.broadcast({ type: 'raw', data: line, agent: this.key });
          }
        }
      });

      this.process.stderr.on('data', (chunk) => {
        this.broadcast({ type: 'error', data: chunk.toString(), agent: this.key });
      });

      const exitCode = await new Promise(resolve => {
        this.process.on('exit', resolve);
      });

      console.log(`[${this.key}] exited with code ${exitCode}, restarting in 2s...`);
      await sleep(2000);
    }
  }

  handleMessage(msg) {
    this.activityLog.push(msg);

    // Detect browser mode from tool calls
    if (msg.type === 'tool_use' && msg.name?.startsWith('mcp_computer_')) {
      this.lastBrowserToolTime = Date.now();
      if (this.mode !== 'browser') {
        this.mode = 'browser';
        this.broadcast({ type: 'mode_switch', mode: 'browser', agent: this.key });
      }
    }

    // Detect return to terminal mode (10s without browser tool call)
    if (msg.type === 'tool_use' && !msg.name?.startsWith('mcp_computer_')) {
      if (this.mode === 'browser' && Date.now() - this.lastBrowserToolTime > 10000) {
        this.mode = 'terminal';
        this.broadcast({ type: 'mode_switch', mode: 'terminal', agent: this.key });
      }
    }

    // Forward structured message to all subscribers
    this.broadcast({ type: 'activity', msg, agent: this.key });
  }

  broadcast(event) {
    const data = JSON.stringify(event);
    for (const sub of this.subscribers) {
      sub.write(`data: ${data}\n\n`);
    }
  }

  subscribe(sseResponse) {
    // Send recent activity log so client gets context
    for (const msg of this.activityLog.getAll()) {
      sseResponse.write(`data: ${JSON.stringify({ type: 'activity', msg, agent: this.key })}\n\n`);
    }
    sseResponse.write(`data: ${JSON.stringify({ type: 'mode_switch', mode: this.mode, agent: this.key })}\n\n`);
    this.subscribers.add(sseResponse);
    sseResponse.on('close', () => this.subscribers.delete(sseResponse));
  }
}
```

The key insight: because `--output streaming` gives us structured JSON, the Orchestrator can detect browser mode directly from tool call names (`mcp_computer_*`) without needing the Computer Use MCP to report mode changes. This eliminates the separate ActivityTracker and the HTTP callback between MCP server and Orchestrator — a simpler architecture.

### Agent Spawning Flow

When the CEO agent decides to spawn the Community Manager:

```
1. CEO calls: mcp_swarm_spawn_agent({
     role: "community-manager",
     business: "vintage-stickers",
     mission: "Build and engage our community on X (Twitter). Post daily content...",
     browser_domains: ["x.com", "twitter.com"],
     skills: ["community-manager"]
   })

2. Swarm Bus receives spawn request → forwards to Orchestrator

3. Orchestrator:
   a. Creates /opt/vibers/businesses/vintage-stickers/agents/community-manager/workspace/
   b. Generates AGENTS.md from the mission, role, team structure, and conventions
   c. Writes .vibe/config.toml with MCP servers and model config
   d. Writes .vibe/prompts/system.md
   e. Copies skill templates: shared/* + community-manager/* → .vibe/skills/
   f. Registers browser_domains with Computer Use MCP's allowlist
      (pending Security Director approval)
   g. Registers agent with Swarm Bus
   h. Launches Vibe subprocess with --resume
   i. Begins capturing stdout into scrollback buffer
   j. Notifies CEO agent via Swarm Bus: "community-manager is online"

4. Community Manager's Vibe process boots:
   - Reads AGENTS.md → knows its role, mission, team, conventions
   - Loads .vibe/config.toml → connects to MCP servers
   - Discovers skills → has post-tweet, check-messages, etc.
   - Starts first work cycle per AGENTS.md conventions

5. Frontend mosaic detects new agent via Orchestrator SSE →
   adds a new tile for community-manager
```

### Lightweight Delegation: Vibe's `task` Tool

Not every delegation needs a full agent spawn. Vibe has a built-in `task` tool for subagent delegation — a lightweight, in-memory subprocess that runs a focused task and returns results as text.

```
CEO: task(task="Research the top 5 vintage sticker marketplaces and their commission rates", agent="explore")
→ Explore subagent runs in-memory (read-only, no MCP access)
→ Returns: "1. Redbubble (30% commission)... 2. Etsy (6.5% + $0.20)..."
→ CEO uses this to inform the business plan
```

Use `task` for quick research, analysis, or planning. Use `mcp_swarm_spawn_agent` for persistent agents with their own workspace, MCP access, and autonomous work cycles.

Custom subagents can be defined in `.vibe/agents/`:

```toml
# .vibe/agents/research.toml
display_name = "Research"
description = "Read-only subagent for quick research tasks"
safety = "safe"
agent_type = "subagent"
enabled_tools = ["grep", "read_file"]
```

---

## Live Observability System

### The Core Insight

Every agent tile in the mosaic shows **what the agent is doing right now**. Agents are not "CLI agents" or "browser agents" — they're agents that freely switch between terminal work and browser work. The tile follows them.

### Activity Modes

| Activity | Tile shows | Source |
|----------|-----------|--------|
| Agent calls `bash`, `write_file`, `grep`, `read_file` | Structured activity feed — tool calls, reasoning, results | Orchestrator parses NDJSON stdout → SSE → React components |
| Agent calls `mcp_computer_screenshot`, `mcp_computer_click`, `mcp_computer_navigate` | Browser screencast — live video of Chrome tab | CDP `Page.screencastFrame` → SSE → `<img>` tag |
| Agent idle (waiting for Mistral API) | Last active view + subtle "thinking..." indicator | Mode unchanged, overlay added |

### Streaming Output Format

Vibe's `--output streaming` emits **newline-delimited JSON** (NDJSON). Each line is a self-contained JSON object:

```jsonl
{"type":"system","subtype":"init","model":"devstral-2","session_id":"..."}
{"role":"assistant","content":"Let me check for new messages from the team..."}
{"type":"tool_use","name":"mcp_swarm_get_messages","input":{}}
{"type":"tool_result","name":"mcp_swarm_get_messages","output":"2 new messages..."}
{"role":"assistant","content":"Marketing Director wants a tweet about the new sticker pack. Let me draft one."}
{"type":"tool_use","name":"write_file","input":{"path":"drafts/sticker-launch.md","content":"..."}}
{"type":"tool_result","name":"write_file","output":"File written successfully"}
{"type":"tool_use","name":"mcp_computer_navigate","input":{"url":"https://x.com"}}
{"type":"tool_result","name":"mcp_computer_navigate","output":{"image":"base64...","elements":[...]}}
{"type":"result","usage":{"input_tokens":1200,"output_tokens":450},"duration_ms":8500,"total_cost_usd":0.003}
```

This is NOT raw ANSI terminal output. It's structured data. The Orchestrator parses each line and renders it semantically in the frontend — showing tool calls with their names and parameters, assistant reasoning as text, results as confirmations. This is *more informative* than a raw terminal view.

**Known issue (GitHub #208):** The `session_id` field is currently missing from streaming output. Workaround: after spawning a Vibe process, read the session ID from the session log file at `$VIBE_HOME/logs/session/session_*.json` (the most recently modified file created after the process started).

### Mode Switching — Simplified by NDJSON

Because `--output streaming` gives us structured JSON with tool call names, the Orchestrator detects mode switches directly from the agent's output stream. No separate ActivityTracker needed.

The detection logic in `AgentProcess.handleMessage()`:
- Agent calls `mcp_computer_*` tool → switch to browser mode, start forwarding screencast frames
- Agent calls any non-`mcp_computer_*` tool and 10+ seconds since last browser tool → switch back to terminal mode
- The mode switch event propagates via SSE to the frontend tile

### Unified SSE Stream Per Agent

The Orchestrator exposes one SSE endpoint per agent that forwards parsed NDJSON events:

```
GET /api/agents/vintage-stickers--community-manager/stream
→ SSE stream:

data: {"type":"activity","msg":{"role":"assistant","content":"Checking messages..."},"agent":"vintage-stickers--community-manager"}
data: {"type":"activity","msg":{"type":"tool_use","name":"mcp_swarm_get_messages","input":{}},"agent":"..."}
data: {"type":"activity","msg":{"type":"tool_result","name":"mcp_swarm_get_messages","output":"..."},"agent":"..."}
data: {"type":"activity","msg":{"role":"assistant","content":"Time to post. Opening x.com..."},"agent":"..."}
data: {"type":"activity","msg":{"type":"tool_use","name":"mcp_computer_navigate","input":{"url":"https://x.com"}},"agent":"..."}
data: {"type":"mode_switch","mode":"browser","agent":"..."}
data: {"type":"screencast_frame","frame":"base64-JPEG...","timestamp":1709145600}
  ... (agent browsing — frames at ~6fps)
data: {"type":"mode_switch","mode":"terminal","agent":"..."}
data: {"type":"activity","msg":{"role":"assistant","content":"Tweet posted. Updating logs."},"agent":"..."}
```

### Frontend Tile Component

```jsx
function AgentTile({ agentKey }) {
  const [mode, setMode] = useState('terminal');
  const [activities, setActivities] = useState([]);
  const imgRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const es = new EventSource(`/api/agents/${agentKey}/stream`);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'activity':
          setActivities(prev => [...prev.slice(-200), data.msg]);  // Keep last 200
          break;
        case 'mode_switch':
          setMode(data.mode);
          break;
        case 'screencast_frame':
          if (imgRef.current)
            imgRef.current.src = `data:image/jpeg;base64,${data.frame}`;
          break;
      }
    };
    return () => es.close();
  }, [agentKey]);

  // Auto-scroll activity feed
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [activities]);

  return (
    <div className="agent-tile">
      <div className="tile-header">
        <span className="agent-name">{agentKey.split('--')[1]}</span>
        <span className={`mode-badge ${mode}`}>{mode}</span>
      </div>
      {/* Both always mounted — preserves activity history */}
      <div ref={scrollRef} className="activity-feed"
           style={{ display: mode === 'terminal' ? 'block' : 'none', overflow: 'auto' }}>
        {activities.map((msg, i) => <ActivityLine key={i} msg={msg} />)}
      </div>
      <div style={{ display: mode === 'browser' ? 'block' : 'none' }}>
        <img ref={imgRef} alt="Live browser" style={{ width: '100%' }} />
      </div>
    </div>
  );
}

function ActivityLine({ msg }) {
  if (msg.role === 'assistant') {
    return <div className="activity-thought">{msg.content?.slice(0, 120)}</div>;
  }
  if (msg.type === 'tool_use') {
    return <div className="activity-tool">▶ {msg.name}({JSON.stringify(msg.input).slice(0, 80)})</div>;
  }
  if (msg.type === 'tool_result') {
    return <div className="activity-result">✓ {msg.name} completed</div>;
  }
  return null;
}
```

Both views stay mounted so activity history is preserved when the agent switches to browser and back. The structured activity feed is *more readable* than a raw terminal — the audience sees "▶ mcp_computer_click(5)" and "✓ write_file completed" rather than ANSI escape codes.

### Screencast Integration

```javascript
async function startScreencastForAgent(agentKey, cdpClient) {
  await cdpClient.send('Page.startScreencast', {
    format: 'jpeg', quality: 50, maxWidth: 960, maxHeight: 540,
    everyNthFrame: Math.ceil(60 / 6)  // ~6fps
  });

  cdpClient.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cdpClient.send('Page.screencastFrameAck', { sessionId });
    orchestratorClient.sendFrame(agentKey, data, metadata.timestamp);
  });
}
```

### Bandwidth

| Scenario | Bandwidth | Notes |
|----------|-----------|-------|
| Terminal stream per agent | ~1-5 KB/s | Text only |
| Browser screencast per agent | ~200-350 KB/s | 960×540, JPEG q50, 6fps |
| 8 agents mosaic, 2 browsing | ~1 MB/s | Comfortable |
| 20 agents, 5 browsing | ~2 MB/s | Still fine |

Admin mosaic on localhost → bandwidth effectively unlimited.

---

## Chrome Pool

Chrome runs once on the host. All agents share it.

### Launch

```bash
# Chrome needs a display to render pixels for screenshots and screencast
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99

google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="/opt/vibers/chrome-data" \
  --window-size=1920,1080 \
  --no-first-run \
  --no-default-browser-check \
  --single-process \
  --disable-gpu \
  --disable-software-rasterizer \
  --disable-extensions \
  --disable-plugins \
  --disable-sync \
  --disable-translate \
  --disable-background-networking \
  --disable-default-apps \
  --disable-hang-monitor \
  --disable-popup-blocking \
  --disable-domain-reliability \
  --disable-component-update \
  --disable-background-timer-throttling \
  --disable-renderer-backgrounding \
  --disable-backgrounding-occluded-windows \
  --disable-dev-shm-usage \
  --no-sandbox \
  --js-flags="--max-old-space-size=64" \
  --renderer-process-limit=1 &
```

### Tab Management

```javascript
class TabManager {
  constructor(cdpPort) {
    this.port = cdpPort;
    this.assignments = new Map();  // agentKey → { targetId, client }
  }

  async getOrCreateTab(agentKey) {
    if (this.assignments.has(agentKey)) return this.assignments.get(agentKey);

    const CDP = require('chrome-remote-interface');
    const { targetId } = await CDP.New({ port: this.port, url: 'about:blank' });
    const client = await CDP({ port: this.port, target: targetId });
    await client.Page.enable();
    await client.DOM.enable();
    await client.Runtime.enable();
    await client.Input.enable();

    this.assignments.set(agentKey, { targetId, client });
    return { targetId, client };
  }

  async releaseTab(agentKey) {
    const assignment = this.assignments.get(agentKey);
    if (assignment) {
      await CDP.Close({ port: this.port, id: assignment.targetId });
      this.assignments.delete(agentKey);
    }
  }
}
```

Tabs are created lazily — only when an agent first calls a browser tool.

---

## MCP Tool Definitions

Every agent can call these tools. The core loop: **screenshot → reason → act → screenshot → verify**.

### Agent Identity

Every MCP tool call includes the agent's identity via HTTP headers (configured in the agent's `config.toml`). The MCP server uses this for tab routing, domain enforcement, and activity tracking.

```javascript
function getAgentKey(request) {
  const agentId = request.headers['x-agent-id'];
  const businessId = request.headers['x-business-id'];
  return `${businessId}--${agentId}`;
}
```

### Vision

#### `screenshot`

Annotated screenshot with numbered interactive elements. Iframes included seamlessly.

```json
{
  "name": "screenshot",
  "description": "Take an annotated screenshot. Every interactive element is labeled with a number. Returns the image and a text element list.",
  "inputSchema": { "type": "object", "properties": {} }
}
```

**Returns:**
```json
{
  "image": "base64-encoded JPEG with numbered overlays",
  "url": "https://x.com/compose/tweet",
  "title": "Compose / X",
  "elements": [
    { "id": 1, "tag": "a", "text": "Home", "type": null, "frame": "top" },
    { "id": 2, "tag": "div", "text": "", "type": "contenteditable", "placeholder": "What's happening?", "frame": "top" },
    { "id": 3, "tag": "button", "text": "Post", "type": "submit", "frame": "top" }
  ]
}
```

#### `get_page_info`

Lightweight — URL, title, frames. No screenshot.

```json
{
  "name": "get_page_info",
  "description": "Get current page URL, title, and frames. No screenshot.",
  "inputSchema": { "type": "object", "properties": {} }
}
```

### Navigation

#### `navigate`

```json
{
  "name": "navigate",
  "description": "Navigate to a URL. Must be on your approved domain list.",
  "inputSchema": {
    "type": "object",
    "properties": { "url": { "type": "string" } },
    "required": ["url"]
  }
}
```

Returns annotated screenshot. Triggers browser mode for observability.

#### `wait`

```json
{
  "name": "wait",
  "description": "Wait for page update, then take new annotated screenshot.",
  "inputSchema": {
    "type": "object",
    "properties": { "seconds": { "type": "number", "description": "Default: 2" } }
  }
}
```

### Interaction

All interaction tools auto-return new annotated screenshots and trigger the activity tracker.

#### `click`
```json
{ "name": "click", "description": "Click element by annotation number. Human-like cursor motion.",
  "inputSchema": { "type": "object", "properties": { "element_id": { "type": "integer" } }, "required": ["element_id"] } }
```

#### `double_click`
```json
{ "name": "double_click", "description": "Double-click element by annotation number.",
  "inputSchema": { "type": "object", "properties": { "element_id": { "type": "integer" } }, "required": ["element_id"] } }
```

#### `hover`
```json
{ "name": "hover", "description": "Hover over element to trigger tooltips/dropdowns.",
  "inputSchema": { "type": "object", "properties": { "element_id": { "type": "integer" } }, "required": ["element_id"] } }
```

#### `type`
```json
{ "name": "type", "description": "Type text with human-like timing (30-120ms between chars). Click an input first to focus it.",
  "inputSchema": { "type": "object", "properties": { "text": { "type": "string" }, "clear_first": { "type": "boolean" } }, "required": ["text"] } }
```

#### `press`
```json
{ "name": "press", "description": "Press key or combination. Examples: 'Enter', 'Tab', press('a', modifiers=['Control']).",
  "inputSchema": { "type": "object", "properties": { "key": { "type": "string" }, "modifiers": { "type": "array", "items": { "type": "string" } } }, "required": ["key"] } }
```

#### `scroll`
```json
{ "name": "scroll", "description": "Scroll page, return new annotated screenshot.",
  "inputSchema": { "type": "object", "properties": { "direction": { "type": "string", "enum": ["up", "down"] }, "amount": { "type": "string", "enum": ["small", "medium", "page"] } }, "required": ["direction"] } }
```

#### `drag`
```json
{ "name": "drag", "description": "Drag between elements with bezier curve motion. For captchas, drag-and-drop, reordering.",
  "inputSchema": { "type": "object", "properties": { "from_element_id": { "type": "integer" }, "to_element_id": { "type": "integer" } }, "required": ["from_element_id", "to_element_id"] } }
```

#### `drag_offset`
```json
{ "name": "drag_offset", "description": "Drag element by pixel offset. For slide puzzles where target isn't a DOM element.",
  "inputSchema": { "type": "object", "properties": { "element_id": { "type": "integer" }, "offset_x": { "type": "integer" }, "offset_y": { "type": "integer" } }, "required": ["element_id", "offset_x", "offset_y"] } }
```

#### `select_option`
```json
{ "name": "select_option", "description": "Select from dropdown. Handles native <select> and custom JS dropdowns.",
  "inputSchema": { "type": "object", "properties": { "element_id": { "type": "integer" }, "value": { "type": "string" } }, "required": ["element_id", "value"] } }
```

### Tab Management

#### `tab_list`
```json
{ "name": "tab_list", "description": "List your open browser tabs.", "inputSchema": { "type": "object", "properties": {} } }
```

#### `tab_open`
```json
{ "name": "tab_open", "description": "Open new tab at URL.", "inputSchema": { "type": "object", "properties": { "url": { "type": "string" } }, "required": ["url"] } }
```

#### `tab_switch`
```json
{ "name": "tab_switch", "description": "Switch to a different tab.", "inputSchema": { "type": "object", "properties": { "tab_id": { "type": "string" } }, "required": ["tab_id"] } }
```

#### `tab_close`
```json
{ "name": "tab_close", "description": "Close a tab.", "inputSchema": { "type": "object", "properties": { "tab_id": { "type": "string" } }, "required": ["tab_id"] } }
```

---

## Screenshot Annotation Engine

The core innovation. DOM awareness for precision, vision for robustness.

### Process

```javascript
async function annotatedScreenshot(cdpClient) {
  // 1. Get all frames (main page + iframes)
  const { frameTree } = await cdpClient.send('Page.getFrameTree');
  const allFrames = flattenFrameTree(frameTree);

  let elementId = 1;
  const elementMap = {};

  for (const frame of allFrames) {
    const contextId = await getExecutionContext(cdpClient, frame.frame.id);
    if (!contextId) continue;

    // 2. Query interactive elements in this frame
    const { result } = await cdpClient.send('Runtime.evaluate', {
      contextId, returnByValue: true,
      expression: `
        (() => {
          const sel = 'a[href],button,input,textarea,select,[role="button"],[role="link"],' +
            '[role="tab"],[role="checkbox"],[role="radio"],[role="slider"],[role="menuitem"],' +
            '[onclick],[tabindex],[contenteditable="true"],[draggable="true"],label,summary,' +
            'img[src*="captcha"],canvas';
          return [...document.querySelectorAll(sel)]
            .filter(el => {
              const r = el.getBoundingClientRect();
              const s = window.getComputedStyle(el);
              return r.width > 0 && r.height > 0
                && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
            })
            .map(el => {
              const r = el.getBoundingClientRect();
              return {
                tag: el.tagName.toLowerCase(),
                text: (el.innerText||el.value||el.alt||el.title||el.placeholder||'').slice(0,80),
                type: el.type||null, placeholder: el.placeholder||null,
                role: el.getAttribute('role'), ariaLabel: el.getAttribute('aria-label'),
                x: Math.round(r.x), y: Math.round(r.y),
                w: Math.round(r.width), h: Math.round(r.height)
              };
            });
        })()
      `
    });

    // 3. Adjust iframe coordinates to main page space
    const offset = await getFrameOffset(cdpClient, frame);
    for (const el of result.value || []) {
      el.x += offset.x; el.y += offset.y;
      elementMap[elementId] = { ...el, frameId: frame.frame.id, contextId };
      elementId++;
    }
  }

  // 4. Screenshot + overlay
  const { data } = await cdpClient.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  const annotatedImage = await overlayAnnotations(data, elementMap);

  return { image: annotatedImage, elements: /* mapped list */, url: /* ... */, title: /* ... */ };
}
```

### Overlay Rendering

```javascript
async function overlayAnnotations(screenshotBase64, elementMap) {
  const { createCanvas, loadImage } = require('canvas');
  const img = await loadImage(Buffer.from(screenshotBase64, 'base64'));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  for (const [id, el] of Object.entries(elementMap)) {
    // Subtle border
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(el.x, el.y, el.w, el.h);

    // Numbered marker at element top-center
    const cx = el.x + el.w / 2, cy = el.y;
    ctx.fillStyle = 'rgba(255, 50, 50, 0.85)';
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'white'; ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(id, cx, cy);
  }

  return canvas.toBuffer('image/jpeg', { quality: 0.85 }).toString('base64');
}
```

### Click Resolution

```javascript
async function clickElement(elementId, elementMap, cdpClient) {
  const el = elementMap[elementId];
  const targetX = el.x + el.w / 2, targetY = el.y + el.h / 2;

  await animateCursor(cdpClient, targetX, targetY);  // Bezier curve
  await cdpClient.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: targetX, y: targetY, button: 'left', clickCount: 1
  });
  await sleep(randomBetween(50, 100));
  await cdpClient.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: targetX, y: targetY, button: 'left', clickCount: 1
  });

  await sleep(randomBetween(300, 800));
  return await annotatedScreenshot(cdpClient);
}
```

CDP routes clicks to the correct iframe based on coordinates — no special handling needed.

---

## Human-Like Input Engine

### Cursor (Bezier Curve)
```javascript
async function animateCursor(cdpClient, targetX, targetY) {
  const startX = lastCursorX || randomBetween(0, 100);
  const startY = lastCursorY || randomBetween(0, 100);
  const ctrlX = (startX + targetX) / 2 + randomBetween(-50, 50);
  const ctrlY = (startY + targetY) / 2 + randomBetween(-30, 30);
  const steps = randomBetween(15, 25), duration = randomBetween(300, 600);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1-t)**2*startX + 2*(1-t)*t*ctrlX + t**2*targetX;
    const y = (1-t)**2*startY + 2*(1-t)*t*ctrlY + t**2*targetY;
    await cdpClient.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) });
    await sleep(duration / steps);
  }
  lastCursorX = targetX; lastCursorY = targetY;
}
```

### Keystrokes
```javascript
async function typeText(cdpClient, text) {
  for (const char of text) {
    if (Math.random() < 0.05) await sleep(randomBetween(200, 500));
    await cdpClient.send('Input.dispatchKeyEvent', { type: 'keyDown', text: char });
    await sleep(randomBetween(10, 30));
    await cdpClient.send('Input.dispatchKeyEvent', { type: 'keyUp', text: char });
    await sleep(randomBetween(30, 120));
  }
}
```

### Drag
```javascript
async function dragBetween(cdpClient, fromX, fromY, toX, toY) {
  await animateCursor(cdpClient, fromX, fromY);
  await cdpClient.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fromX, y: fromY, button: 'left', clickCount: 1 });
  await sleep(randomBetween(100, 200));

  const steps = randomBetween(20, 35), duration = randomBetween(400, 800);
  const cx = (fromX+toX)/2 + randomBetween(-20,20), cy = (fromY+toY)/2 + randomBetween(-15,15);
  for (let i = 1; i <= steps; i++) {
    const t = i/steps;
    await cdpClient.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round((1-t)**2*fromX + 2*(1-t)*t*cx + t**2*toX),
      y: Math.round((1-t)**2*fromY + 2*(1-t)*t*cy + t**2*toY)
    });
    await sleep(duration / steps);
  }
  await cdpClient.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button: 'left', clickCount: 1 });
}
```

---

## Security

### Domain Allowlist

Set by Security Director during agent spawning. Enforced server-side by Computer Use MCP before any navigation.

```javascript
function isAllowed(agentKey, url) {
  const allowed = agentAllowlists[agentKey];
  if (!allowed) return false;  // No allowlist = no browser access
  const hostname = new URL(url).hostname;
  return allowed.some(d => hostname === d || hostname.endsWith('.' + d));
}
```

### Process Isolation — Hackathon vs Production

**Hackathon:** Vibe processes on bare host, `--workdir` scoping. An agent *could* read another business's files via bash. Acceptable for demo.

**Production (not built for hackathon):**

| Layer | Mechanism | Prevents |
|-------|-----------|----------|
| Linux namespaces | `unshare --mount --pid --net` | Filesystem/process/network visibility |
| Seccomp | Restrict syscalls | Privilege escalation |
| cgroups v2 | CPU/RAM limits | Resource starvation |
| Read-only bind mounts | Shared knowledge base | Data corruption |

Zero changes to agent code or MCP interfaces needed. It's a deployment concern, not an architecture concern.

### Chrome Access

Agents cannot reach Chrome directly. No CDP port is exposed to agent processes. The Computer Use MCP is the sole gateway — it enforces domain allowlists, tab isolation, and rate limits.

---

## Captcha Handling

Real Chrome + real display + human-like timing = most captchas pass without challenge.

**reCAPTCHA checkbox:** `click(14)` → 80% passes silently.

**Image grid:** Vision model identifies correct squares from annotated screenshot. Agent clicks them.

**Slide puzzle:** `drag_offset(8, 187, 0)` — agent estimates distance from screenshot.

**Turnstile:** `click(11)` → passes on real Chrome.

Retry up to 3 times. If failing, report to parent agent.

---

## Example Flows

### Flow 1: CEO Spawns the Team

```
User: "I want to build a vintage stickers business"

CEO (terminal tile):
> Reading brief... vintage stickers. Drafting business plan.
> write_file: workspace/business-plan.md
> Setting up the team. Starting with security.

CEO: mcp_swarm_spawn_agent({ role: "security-director", ... })
→ New tile appears: security-director (terminal)

CEO: mcp_swarm_spawn_agent({ role: "community-manager", browser_domains: ["x.com"], ... })
→ Security reviews and approves
→ New tile appears: community-manager (terminal)

CEO continues spawning 6 more agents...
```

Audience sees tiles appearing one by one as the CEO builds its org.

### Flow 2: Community Manager Posts a Tweet

```
Community Manager (terminal):
> Reading mission... Build X presence.
> Checking credentials... found X account.
> Logging in to post.

mcp_computer_navigate({ url: "https://x.com" })
→ TILE SWITCHES TO BROWSER — audience sees x.com loading live

mcp_computer_click(5)  ← compose area
mcp_computer_type({ text: "developers love stickers 🎨 #JustVibeIt" })
→ Audience sees text appearing character by character

mcp_computer_click(9)  ← Post
→ Tweet posted

mcp_swarm_send_message({ to: "marketing-director", content: "Tweet posted." })

> Updating scheduled-posts.md...
→ TILE SWITCHES BACK TO TERMINAL
```

### Flow 3: Multi-Tab Email Verification

```
Agent on x.com signup → enters email → X sends verification code

mcp_computer_tab_open({ url: "https://mail.google.com" })
→ Tab 2: Gmail

mcp_computer_click(12)  ← opens verification email
→ Reads code "847291" from screenshot

mcp_computer_tab_switch({ tab_id: "tab-1" })
→ Back to X signup

mcp_computer_type({ text: "847291" })
mcp_computer_click(8)  ← Verify
→ Account created
```

Audience watches the agent juggle tabs in real time.

---

## Resource Math

| Scenario | Agents | Agent RAM | Chrome | Infrastructure | Total |
|----------|--------|-----------|--------|---------------|-------|
| **1 business** | 8 × 60MB | 480MB | 400MB | 200MB | **~1.1GB** |
| **Demo (3 biz)** | 24 × 60MB | 1.4GB | 500MB | 200MB | **~2.1GB** |
| **20 businesses** | 160 × 60MB | 9.6GB | 800MB | 200MB | **~10.6GB** |

16GB server handles the demo. 32GB handles 20+ businesses.

---

## Implementation Plan

### File Structure

```
/vibers-money/
  orchestrator/
    server.ts                 ← HTTP API + process management
    agent-process.ts          ← Vibe subprocess wrapper + stdout capture
    activity-stream.ts        ← Unified SSE multiplexer
    spawner.ts                ← Workspace creation (dirs, config, AGENTS.md, skills)
    templates/
      agents-md/              ← AGENTS.md generators per role
        ceo.md.hbs            ← Handlebars template for CEO AGENTS.md
        community-manager.md.hbs
        security-director.md.hbs
        frontend-builder.md.hbs
        generic.md.hbs        ← fallback for roles without a specific template
      config.toml.hbs         ← config.toml template with MCP servers
  
  skill-templates/            ← skill library, copied into agent workspaces at spawn
    shared/
      check-messages/SKILL.md
      report-status/SKILL.md
    ceo/
      spawn-agent/SKILL.md
      write-business-plan/SKILL.md
      review-status/SKILL.md
    community-manager/
      post-tweet/SKILL.md
      engage-followers/SKILL.md
      check-analytics/SKILL.md
    security-director/
      review-access-request/SKILL.md
      audit-agent-activity/SKILL.md
    frontend-builder/
      scaffold-site/SKILL.md
      deploy-preview/SKILL.md
    marketing-director/
      competitor-analysis/SKILL.md
      campaign-planning/SKILL.md
    copywriter/
      draft-copy/SKILL.md
      brand-voice/SKILL.md
  
  computer-use-mcp/
    server.ts                 ← MCP server entry point
    tools/                    ← vision, navigation, interaction, tabs
    engine/                   ← annotator, iframe-resolver, cursor, keyboard, drag, timing
    chrome/                   ← pool, tab-manager
    screencast/               ← manager, frames-to-orchestrator
    security/                 ← allowlist
  
  swarm-bus-mcp/              ← per existing spec
  
  frontend/
    mosaic/                   ← AgentTile, MosaicGrid, ActivityLine, ScreencastStream
  
  launch/
    setup.sh                  ← Xvfb + Chrome + deps
    start.sh                  ← Launch all services
    trust-all-workdirs.sh     ← Pre-trust all agent workdirs in Vibe's trusted_folders.toml
```

### Build Priority

| Priority | Component | Time |
|----------|-----------|------|
| **P0** | Orchestrator: spawn Vibe + parse NDJSON stdout | 2h |
| **P0** | Orchestrator: SSE per agent (structured activity stream) | 1h |
| **P0** | AGENTS.md templates + skill templates (CEO, CM, Security) | 2h |
| **P0** | Computer Use MCP: annotated screenshot engine | 2h |
| **P0** | Computer Use MCP: click + type + navigate | 1.5h |
| **P0** | Frontend: mosaic with structured activity tiles | 1.5h |
| **P1** | Screencast manager + browser tile rendering + mode switching | 2h |
| **P1** | Agent spawning: Swarm Bus → Orchestrator flow | 1.5h |
| **P1** | Tab management, press, scroll, hover, drag | 2h |
| **P1** | Remaining skill templates (marketing, frontend, copywriter) | 1h |
| **P2** | get_page_info, adaptive framerate, agent graph view | 2.5h |

**P0: ~10 hours.** Agents running with identity + skills, structured activity visible, browser working.
**P0+P1: ~16.5 hours.** Full demo with dynamic tiles, spawning, screencast, all roles skilled.

Note: the separate ActivityTracker from v1 is gone. Mode switching is detected directly from the NDJSON stream (tool call names starting with `mcp_computer_`), saving ~1 hour of implementation and eliminating the HTTP callback between Computer Use MCP and Orchestrator.

---

## Pre-Hackathon Checklist

**Vibe integration (HIGHEST PRIORITY — test these first):**
- [ ] Vibe connects to HTTP MCP servers via `[[mcp_servers]]` — test both `http` and `streamable-http` transport
- [ ] Confirm `--output streaming` emits NDJSON with `type`, `role`, `name` fields. Parse and verify structure.
- [ ] Verify agent identity headers (`X-Agent-Id`, `X-Business-Id`) arrive at MCP server on every tool call
- [ ] `VIBE_HOME` scopes config per agent (no cross-contamination between concurrent agents)
- [ ] Multiple concurrent Vibe processes — no global state conflicts (test 8 simultaneous agents)
- [ ] `--resume SESSION_ID` works correctly. Implement session ID file-based workaround for GitHub #208.
- [ ] `--max-turns` and `--max-price` actually halt the agent when limits are reached
- [ ] `enable_auto_update = false` in config prevents update prompts during autonomous operation
- [ ] Pre-trust all agent workdirs — either via `trusted_folders.toml` or test if `VIBE_HOME` bypasses trust checks
- [ ] `skill_paths` shared directory works — agents discover skills from both local `.vibe/skills/` and shared paths
- [ ] `enabled_skills` glob patterns work (e.g., `"post-*"` matches `post-tweet`)
- [ ] Vibe's `task` tool for subagent delegation — test if CEO can delegate quick research without full agent spawn

**Chrome + Computer Use MCP:**
- [ ] Xvfb + Chrome runs on target server
- [ ] CDP connection + `Page.captureScreenshot` works
- [ ] Annotation engine works on x.com and Gmail (including iframes)
- [ ] Human-like input (bezier cursor, keystroke timing) on x.com compose box
- [ ] `Page.startScreencast` produces usable JPEG frames from Xvfb
- [ ] Devstral 2 vision: identifies correct elements from annotated screenshot
- [ ] Devstral 2 vision: identifies captcha images accurately
- [ ] Chrome stays under 400MB with `--single-process` and 20 tabs
- [ ] node-canvas annotations readable at 960×540

**Accounts + Content:**
- [ ] Pre-create 10-15 X accounts + Gmail accounts

**Frontend:**
- [ ] Structured activity renderer displays NDJSON events readably (tool calls, reasoning, results)
- [ ] Browser screencast frames render correctly in `<img>` tags
- [ ] Mode switching transitions smoothly between activity feed and screencast

---

## Known Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **MCP headers not forwarded by Vibe** | Medium | High | Test `headers` field in `[[mcp_servers]]` config. Fallback: encode agent identity in URL query params. |
| **Session ID missing from streaming (#208)** | Confirmed | Medium | File-based workaround: read `$VIBE_HOME/logs/session/session_*.json` after process starts. |
| **Vibe auto-update interrupts agent** | Medium | High | Set `enable_auto_update = false`. Test it suppresses updates. |
| **Trust folder prompt blocks startup** | Medium | High | Pre-trust workdirs via `trusted_folders.toml`, or test if `--auto-approve` bypasses. |
| **Multiple Vibe processes share state** | Low | High | `VIBE_HOME` per agent. Test 8 concurrent launches. |
| **`skill_paths` shared dir not discovered** | Medium | Medium | Test before hackathon. Fallback: copy shared skills at spawn time. |
| **Devstral 2 vision unreliable** | Medium | Critical | Text element list as fallback. Extensive pre-testing. |
| **Gmail requires phone verification** | High | High | Pre-create accounts. |
| **Agent crashes, doesn't recover** | Medium | Medium | Orchestrator restart loop + `--resume`. |
| **`--max-price` doesn't halt cleanly** | Low | Medium | Test. Add Orchestrator-side cost monitoring as backup. |
| **Agent reads other business files** | Low | None (demo) | Acceptable. Agents have no reason/knowledge to explore. |
| **Mode switching flickers** | Medium | Low | 10s idle timeout before switching back to terminal. |
| **X DOM changes before hackathon** | Low | None | Vision-based. The whole point. |
