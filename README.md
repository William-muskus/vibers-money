# Vibers.money — Autonomous Business Launcher

**Launch any business and have it run autonomously by a swarm of AI agents.**

Describe your idea → a CEO agent and directors (Marketing, Product, Finance, CTO, Security) stand up the company, create content, and keep working 24/7. Chat with your CEO, fund via Stripe, run locally or in the cloud.

*Just vibe it.*

**Suggested GitHub description:** *Launch any business with a swarm of AI agents — CEO, directors, and specialists that run 24/7. Next.js, Mistral Vibe, Stripe.*  
**Suggested topics:** `ai-agents`, `mistral`, `nextjs`, `stripe`, `autonomous-agents`, `multi-agent`, `vibe`, `llm`.

---

## What is this?

Vibers is an **autonomous business creation platform**. You describe a business idea in plain language; within minutes a **CEO agent** and a **swarm of department agents** (Marketing, Product, Finance, Security, CTO) stand up the company: they create brand identity, set up email, spawn community managers for X/Twitter, draft content, and keep working 24/7. You watch a live org chart, chat with the CEO, and fund the business via Stripe when you’re ready.

- **Target audience:** Vibe coders and builders who want to go from idea to operating business without doing all the ops themselves.
- **Tech:** Next.js frontend, Express orchestrator, Swarm Bus (MCP message bus), and **Mistral Vibe** CLI for each agent. Optional Computer Use MCP for browser automation.

---

## Features

- **Auth:** Sign in with GitHub or Google (NextAuth). Your businesses are tied to your account.
- **Founder chat:** One prompt → CEO engages in a short exploratory conversation, then spawns the org.
- **Agent hierarchy:** CEO → Security Director, CTO, Marketing Director, Product Director, Finance Director → specialists (e.g. Community Manager, Copywriter). All communicate via the Swarm Bus.
- **Real work:** Agents use Mistral Vibe (tools, MCP, bash, browser automation when Computer Use is enabled). They write skills, manage todos, and report back.
- **Local or cloud:** Use Mistral API, AWS Bedrock, or a local model (Ollama, vLLM) — no API key needed for local.
- **Live dashboard:** Real-time CEO stream, cold-start progress indicators, Swarm Bus feed, org directory, and (optional) graph view.
- **Funding:** Per-business Stripe Checkout; optional Stripe Connect so each business gets its own payouts.
- **Smart slug:** Business IDs are derived from your message (e.g. “launch vibers” → `vibers`) so the sidebar stays readable.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js :3001)                                       │
│  Chat, sidebar, finance, admin, Stripe checkout                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  Orchestrator (Express :3000)                                    │
│  Creates businesses, provisions agent workspaces, spawns Vibe   │
│  processes, proxies CEO stream to frontend                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────────────┐
│  Swarm Bus    │   │  Computer Use │   │  Agent processes       │
│  (MCP :3100)  │   │  (MCP :3200)  │   │  (Mistral Vibe CLI)    │
│  Registry,    │   │  Optional:    │   │  CEO + directors       │
│  messaging,   │   │  browser      │   │  each in own workdir   │
│  wake engine  │   │  automation   │   │  + AGENTS.md + skills  │
└───────────────┘   └───────────────┘   └───────────────────────┘
```

| Component        | Port | Role |
|------------------|------|------|
| **Frontend**     | 3001 | Next.js app: home, chat, finance, admin. Proxies API to orchestrator. |
| **Orchestrator** | 3000 | Creates businesses, provisions workspaces, spawns/kills Vibe, streams CEO activity. |
| **Swarm Bus**    | 3100 | MCP server: agent registry, inbox/messaging, wake webhooks. |
| **Computer Use** | 3200 | Optional. MCP server for browser automation (Chrome + CDP). |

---

## Prerequisites

- **Node.js** ≥ 18
- **Mistral Vibe** (for agents): install via pip (`pip install mistral-vibe`) or uv; ensure `vibe` is on `PATH` or set `VIBE_CLI` / `VIBE_USE_PYTHON_MODULE=1` (see [Environment variables](#environment-variables))
- **Mistral API key** for Vibe (or use AWS Bedrock with an OpenAI-compatible gateway; see `docs/` when available)
- **Stripe** (optional): for funding; see [Stripe setup](packages/frontend/app/api/stripe/README.md)

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/William-muskus/vibers-money.git
cd vibers-money
npm install
```

### 2. Environment

Copy the example env and set at least the Mistral key:

```bash
cp .env.example .env
# Edit .env: set MISTRAL_API_KEY=your_key
```

See [Environment variables](#environment-variables) and [.env.example](.env.example) for all options.

### 3. Run the stack

You need **three** processes (four if you use Computer Use):

**Terminal 1 — Orchestrator**

```bash
npm run dev:orchestrator
```

**Terminal 2 — Swarm Bus**

```bash
npm run dev:swarm-bus
```

**Terminal 3 — Frontend**

```bash
npm run dev:frontend
```

**(Optional) Terminal 4 — Computer Use** (for browser automation)

- Start Chrome with remote debugging: `chrome --remote-debugging-port=9222` (or `google-chrome` on Linux).
- Run: `npm run dev:computer-use`

### 4. Open the app

Go to **http://localhost:3001**. Type a business idea (e.g. *“Launch a sticker store for developers, focus on X”*). The CEO will reply, ask 1–3 short questions, and once you answer, spawn the org.

### Running with a local model

You can run agents with a locally hosted model (Ollama, vLLM, or llama.cpp) instead of the Mistral API. All agents share one local server, so requests queue and latency may increase when many agents are active — this is an acceptable tradeoff for local/offline use; the swarm is not capped.

1. Start your local server (e.g. **Ollama**: `ollama serve`, then `ollama pull mistral:7b`).
2. In `.env`, set `LOCAL_LLM_API_BASE` and optionally `LOCAL_LLM_MODEL` (default: `mistral:7b`). Example for Ollama: `LOCAL_LLM_API_BASE=http://localhost:11434/v1`, `LOCAL_LLM_MODEL=mistral:7b`.
3. Run the stack as usual; no `MISTRAL_API_KEY` is required. For full agent behavior (Swarm Bus, Computer Use, skills), use a model that supports OpenAI-style tool/function calling (e.g. Mistral 7B via Ollama).

---

## Project structure

```
vibers-money/
├── package.json                 # Workspace root; scripts for all packages
├── .env.example                 # Env template (copy to .env)
├── agent-templates/             # Handlebars templates for agent workspaces
│   ├── agents-md.hbs            # AGENTS.md per role
│   └── config.toml.hbs         # Vibe config (Mistral or optional Bedrock)
├── skill-templates/             # Skills copied into each agent (meta, shared, directors, marketing)
├── docs/                        # Deployment and ops
│   └── DEPLOY-VIBERS-APP.md     # Deploy to your domain (Vercel, Render, AWS)
├── documentation/               # Product spec (PRD)
├── packages/
│   ├── frontend/                # Next.js app (chat, finance, admin)
│   ├── orchestrator/            # Express API, spawner, agent lifecycle
│   ├── swarm-bus-mcp/           # Swarm Bus MCP server
│   └── computer-use-mcp/        # Computer Use MCP server (browser)
└── businesses/                  # Created at runtime (one folder per business)
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MISTRAL_API_KEY` | Yes (unless Bedrock) | Mistral API key for Vibe agents. |
| `VIBE_CLI` | If `vibe` not on PATH | Full path to Vibe CLI (e.g. `vibe.exe` or `py -3 -m vibe.cli.entrypoint`). |
| `VIBE_USE_PYTHON_MODULE` | No | Set to `1` to run Vibe as `py -m vibe.cli.entrypoint` (avoids PATH issues on Windows). |
| `SWARM_BUS_URL` | No | Default `http://localhost:3100`. Set in production to your Swarm Bus URL. |
| `REDIS_URL` | No | When set, Swarm Bus persists agent registry and inboxes in Redis (survives restarts). When unset, uses in-memory storage (fine for local dev). |
| `ORCHESTRATOR_URL` | No | Default `http://localhost:3000`. Used by Swarm Bus / webhooks. |
| `COMPUTER_USE_URL` | No | Default `http://localhost:3200`. For agents that use browser automation. |
| **Stripe** | For funding | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; see [Stripe README](packages/frontend/app/api/stripe/README.md). |
| **AWS Bedrock** | Optional | `USE_AWS_BEDROCK=1`, `BEDROCK_GATEWAY_URL`, `BEDROCK_GATEWAY_API_KEY` for inference via a Bedrock gateway. |
| **Local LLM** | Optional | `LOCAL_LLM_API_BASE`, `LOCAL_LLM_MODEL` — when set, agents use an OpenAI-compatible local server (Ollama, vLLM, llama.cpp); no `MISTRAL_API_KEY` required. Default model: `mistral:7b`. |

Frontend (e.g. in Vercel) also needs:

- `NEXT_PUBLIC_ORCHESTRATOR_URL` — orchestrator base URL  
- `NEXT_PUBLIC_SWARM_BUS_URL` — Swarm Bus base URL  
- `NEXT_PUBLIC_APP_URL` — app base URL (for Stripe redirects, etc.)

---

## Deployment

- **Deploy to your domain:** [docs/DEPLOY-VIBERS-APP.md](docs/DEPLOY-VIBERS-APP.md) — Vercel + Railway, Render, or AWS (Amplify + App Runner). Dockerfiles for orchestrator and Swarm Bus are in `packages/orchestrator/Dockerfile` and `packages/swarm-bus-mcp/Dockerfile`.
- **Stripe:** [Stripe funding per business](packages/frontend/app/api/stripe/README.md) — checkout, webhooks, optional Connect.

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build all workspaces. |
| `npm run dev:orchestrator` | Start orchestrator (port 3000). |
| `npm run dev:swarm-bus` | Start Swarm Bus (port 3100). |
| `npm run dev:frontend` | Start Next.js (port 3001). |
| `npm run dev:computer-use` | Start Computer Use MCP (port 3200). |
| `npm run dev:all-windows` | PowerShell script to start all in separate windows (Windows). |
| `npm run test` | Run tests in all packages. |

---

## License

Private project. See repository for terms.

---

*Just vibe it.*
