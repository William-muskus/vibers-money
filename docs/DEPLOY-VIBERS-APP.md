# Deploying Vibers to your GoDaddy domain

You own a GoDaddy domain (e.g. **vibers-app.com** or **vibers-app.money**). GoDaddy only holds the domain; you host the app elsewhere and point the domain there via DNS.

- **Use your $100 AWS credit for hosting** → see **[Host on AWS → vibers-app.money](DEPLOY-AWS-VIBERS-APP-MONEY.md)** (Amplify + App Runner or single instance).

## Architecture

- **Frontend**: Next.js 15 (`packages/frontend`) — port 3001
- **Orchestrator**: Express API (`packages/orchestrator`) — port 3000
- **Swarm Bus**: MCP/events (`packages/swarm-bus-mcp`) — port 3100

The frontend calls the orchestrator and swarm bus via env vars. In production you'll set those to your deployed backend URLs.

---

## Option A: Vercel (frontend) + Railway (backend) — recommended

Good balance of free tier, simplicity, and custom domain support.

### 1. Deploy backend (Orchestrator + Swarm Bus) on Railway

1. Go to [railway.app](https://railway.app), sign in with GitHub.
2. **New Project** → **Deploy from GitHub repo** → select your repo.
3. Add **two services** from the same repo (use **repo root** so workspace deps resolve; then target the package):
   - **Service 1 – Orchestrator**
     - Root directory: (leave default, repo root)
     - Build: `npm install && npm run build -w @vibers/orchestrator`
     - Start: `node packages/orchestrator/dist/server.js`
     - **OR** set Root to `packages/orchestrator` and use Build: `npm install && npm run build`, Start: `npm start`
     - In **Settings → Networking**: enable **Public networking** and note the URL (e.g. `https://orchestrator-xxx.up.railway.app`).
   - **Service 2 – Swarm Bus**
     - Root: repo root **or** `packages/swarm-bus-mcp`
     - Build: `npm run build -w @vibers/swarm-bus-mcp` (from root) or `npm install && npm run build` (from package)
     - Start: `node packages/swarm-bus-mcp/dist/server.js` or `npm start`
     - Enable **Public networking** and note the URL (e.g. `https://swarm-bus-xxx.up.railway.app`).

4. In **Orchestrator** service, set **Variables** (if your code expects them):
   - `SWARM_BUS_URL` = the Swarm Bus public URL from step 3.

### 2. Deploy frontend on Vercel

1. Go to [vercel.com](https://vercel.com), sign in with GitHub.
2. **Add New** → **Project** → import your repo.
3. Configure:
   - **Root Directory**: `packages/frontend`
   - **Framework**: Next.js (auto-detected)
   - **Build Command**: `npm run build` (from repo root you may need `cd packages/frontend && npm run build` or set root to repo and override build to `npm run build -w @vibers/frontend`)

4. **Environment Variables** (critical for production):
   - `NEXT_PUBLIC_ORCHESTRATOR_URL` = Orchestrator Railway URL (e.g. `https://orchestrator-xxx.up.railway.app`)
   - `NEXT_PUBLIC_SWARM_BUS_URL` = Swarm Bus Railway URL (e.g. `https://swarm-bus-xxx.up.railway.app`)
   - `NEXT_PUBLIC_APP_URL` = `https://vibers-app.com` (or your Vercel URL until domain is connected)
   - `SWARM_BUS_URL` = same as `NEXT_PUBLIC_SWARM_BUS_URL` (used by API routes server-side)

5. Deploy. Note your Vercel URL (e.g. `https://your-project.vercel.app`).

### 3. Point vibers-app.com to Vercel (GoDaddy DNS)

1. In **Vercel**: Project → **Settings** → **Domains** → Add `vibers-app.com` and `www.vibers-app.com`. Vercel will show the required DNS records.
2. In **GoDaddy**: **My Products** → **DNS** for vibers-app.com.
3. Add/update records as Vercel instructs, typically:
   - **A** record: `@` → `76.76.21.21` (Vercel’s IP; confirm in Vercel dashboard).
   - **CNAME** record: `www` → `cname.vercel-dns.com` (or the exact target Vercel shows).
4. Wait for DNS to propagate (minutes to 48 hours). Vercel will issue SSL for vibers-app.com automatically.

### 4. (Optional) Use a subdomain for the API

If you want `api.vibers-app.com` to point to the Orchestrator:

- **Railway**: In the Orchestrator service, **Settings → Domains** → add custom domain `api.vibers-app.com`. Railway will show the CNAME target.
- **GoDaddy DNS**: Add a **CNAME** record: `api` → Railway’s target (e.g. `xxx.up.railway.app`).
- Then set `NEXT_PUBLIC_ORCHESTRATOR_URL=https://api.vibers-app.com` in Vercel and redeploy.

---

## Option B: All-in-one on Render

You can host frontend + both backends on [render.com](https://render.com) with one repo.

1. **Web Service – Orchestrator**
   - Build: `cd packages/orchestrator && npm install && npm run build`
   - Start: `node dist/server.js`
   - Add env `SWARM_BUS_URL` after you create the Swarm Bus service.

2. **Web Service – Swarm Bus**
   - Build: `cd packages/swarm-bus-mcp && npm install && npm run build`
   - Start: `node dist/server.js`

3. **Web Service – Frontend**
   - Build: `cd packages/frontend && npm install && npm run build`
   - Start: `npm start` (or `npx next start -p $PORT`)
   - Env: `NEXT_PUBLIC_ORCHESTRATOR_URL`, `NEXT_PUBLIC_SWARM_BUS_URL`, `NEXT_PUBLIC_APP_URL`, `SWARM_BUS_URL` (use the Render URLs of the two backend services).

4. **Custom domain**: In the **Frontend** service, **Settings → Custom Domain** → add `vibers-app.com` and `www.vibers-app.com`. Render will show the CNAME (or A) to use.
5. In **GoDaddy DNS**, add the CNAME/A record Render gives you for `vibers-app.com` and `www`.

---

## GoDaddy DNS quick reference

| Type  | Name | Value / Target        | Use case              |
|-------|------|------------------------|-----------------------|
| A     | @    | (Vercel/Render IP)    | root domain           |
| CNAME | www  | cname.vercel-dns.com  | www (Vercel)          |
| CNAME | api  | (Railway/Render host) | api.vibers-app.com    |

After changing DNS, use [dnschecker.org](https://dnschecker.org) to confirm propagation.

---

## Checklist

- [ ] Backend (orchestrator + swarm-bus) deployed and public URLs known
- [ ] Frontend deployed with `NEXT_PUBLIC_ORCHESTRATOR_URL`, `NEXT_PUBLIC_SWARM_BUS_URL`, `NEXT_PUBLIC_APP_URL` set
- [ ] Custom domain added in hosting (Vercel or Render)
- [ ] GoDaddy DNS updated (A and/or CNAME)
- [ ] After DNS propagates, set `NEXT_PUBLIC_APP_URL=https://vibers-app.com` and redeploy if it was still on the default URL

Once DNS points to your host and SSL is active, **https://vibers-app.com** (or **https://vibers-app.money**) will serve your app.
