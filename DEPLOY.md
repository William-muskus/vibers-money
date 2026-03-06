# Deployment guide

## Local development

See [README.md](README.md) Quick start. Run orchestrator, swarm-bus, and frontend in separate terminals. Optional: Redis for swarm persistence (`REDIS_URL`), Ollama for local inference (`LOCAL_LLM_API_BASE`).

## Cloud deployment

### Architecture

- **Frontend:** Deploy to Vercel (Next.js). Set env: `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ORCHESTRATOR_URL` (your backend URL), `NEXT_PUBLIC_APP_URL` (your frontend URL), Stripe keys.
- **Backend:** Run orchestrator + swarm-bus (and optionally Redis) on a VPS or PaaS (Railway, Render, single VPS). Agent workspaces live on the filesystem (`businesses/`), so use a **persistent volume** so data survives restarts.
- **CORS:** Set `FRONTEND_ORIGIN` on the orchestrator to your frontend URL (e.g. `https://your-app.vercel.app`) so the API only accepts requests from your app.

### Backend with Docker Compose

From the repo root:

```bash
# Build and run orchestrator + swarm-bus + Redis
docker compose up -d --build
```

Required env (in `.env` or `docker compose --env-file .env`):

- **Inference:** Either `MISTRAL_API_KEY` or `LOCAL_LLM_API_BASE` (and optionally `LOCAL_LLM_MODEL`).
- **Swarm bus:** `REDIS_URL=redis://redis:6379` (set in compose; optional for persistence).
- **Orchestrator:** `SWARM_BUS_URL=http://swarm-bus:3100`, and in production `FRONTEND_ORIGIN=https://your-app.vercel.app`.
- **Stripe:** If using funding, set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` on the frontend (Vercel); point webhooks at the frontend URL (e.g. `https://your-app.vercel.app/api/stripe/webhook`).

The compose file mounts a volume for `businesses/` so agent workspaces persist across container restarts.

### Frontend (Vercel)

1. Connect the repo to Vercel, set root to the repo root (or `packages/frontend` if you use a monorepo preset that supports it; otherwise build command `npm run build -w @vibers/frontend` and output from the frontend package).
2. Set environment variables (see [Environment variables](README.md#environment-variables)). Required: `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` (and/or Google), `ORCHESTRATOR_URL` (your backend), `NEXT_PUBLIC_APP_URL` (Vercel app URL).
3. Stripe webhooks: in the Stripe dashboard, add an endpoint for `https://your-app.vercel.app/api/stripe/webhook` and set `STRIPE_WEBHOOK_SECRET` in Vercel.

### Single VPS (alternative)

Run Redis, swarm-bus, and orchestrator on one machine (e.g. Hetzner, DigitalOcean). Use the same Docker Compose stack; expose ports 3000 (orchestrator) and optionally 3100 if clients hit swarm-bus directly. Put a reverse proxy (Caddy, nginx) in front with HTTPS and point your domain to the VPS.
