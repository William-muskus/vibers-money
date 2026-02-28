/**
 * Orchestrator HTTP server: SSE endpoints, admin API, spawner integration.
 * Load .env from monorepo root (npm -w runs with cwd=packages/orchestrator, so
 * dotenv/config would miss the root .env).
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import {
  getAgent,
  getAgentsByBusiness,
  getAllAgents,
  getBusinessIds,
} from './registry.js';
import {
  createBusinessAndSpawnCEO,
  spawnAgent,
  injectFounderMessage,
} from './spawner.js';
import { logger } from './logger.js';

const app = express();
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Content-Type'],
  }),
);
app.use(express.json());

app.use((req: Request, _res: Response, next) => {
  logger.debug('request', { method: req.method, path: req.path });
  next();
});

function sseHeaders(res: Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

/** GET /api/agents/:key/stream — SSE per agent (activity + screencast). */
app.get('/api/agents/:key/stream', (req: Request, res: Response) => {
  const { key } = req.params;
  const process = getAgent(key);
  if (!process) {
    logger.warn('stream_not_found', { key });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(404).json({ error: 'Agent not found', key });
    return;
  }
  sseHeaders(res);
  process.subscribe(res);
});

/** GET /api/business/:id/stream — SSE for all agents in a business. */
app.get('/api/business/:id/stream', (req: Request, res: Response) => {
  const { id: businessId } = req.params;
  const processes = getAgentsByBusiness(businessId);
  if (processes.length === 0) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(404).json({ error: 'Business not found or no agents', businessId });
    return;
  }
  sseHeaders(res);
  for (const p of processes) {
    p.subscribe(res);
  }
});

/** GET /api/admin/stream — SSE for all businesses (admin mosaic). */
app.get('/api/admin/stream', (_req: Request, res: Response) => {
  const processes = getAllAgents();
  sseHeaders(res);
  if (processes.length === 0) {
    res.write(`data: ${JSON.stringify({ type: 'info', message: 'No agents yet' })}\n\n`);
  }
  for (const p of processes) {
    p.subscribe(res);
  }
});

/** GET /api/admin/stats — Platform-wide counters. */
app.get('/api/admin/stats', (_req: Request, res: Response) => {
  const businessIds = getBusinessIds();
  const agents = getAllAgents();
  res.json({
    businessCount: businessIds.length,
    agentCount: agents.length,
  });
});

/** GET /api/admin/agents — List of agent keys for admin mosaic. */
app.get('/api/admin/agents', (_req: Request, res: Response) => {
  const agents = getAllAgents();
  res.json({ agents: agents.map((p) => p.key) });
});

/** GET /api/admin/businesses — List of business IDs (for Founder Chat selector). */
app.get('/api/admin/businesses', (_req: Request, res: Response) => {
  res.json({ businessIds: getBusinessIds() });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'orchestrator' });
});

/** POST /api/business/create — Create business + spawn CEO. */
app.post('/api/business/create', async (req: Request, res: Response) => {
  try {
    const body = req.body as { business_id?: string; name?: string; founder_prompt?: string };
    const businessId = body.business_id ?? body.name?.toLowerCase().replace(/\s+/g, '-') ?? undefined;
    if (!businessId) {
      logger.warn('business_create_missing_id', { body: Object.keys(body) });
      res.status(400).json({ error: 'Missing business_id or name' });
      return;
    }
    logger.info('business_create', { businessId, name: body.name });
    const result = await createBusinessAndSpawnCEO(
      businessId,
      body.name,
      body.founder_prompt,
    );
    logger.info('business_create_ok', { businessId, key: result.agentKey });
    res.status(201).json(result);
  } catch (err) {
    logger.error('business_create_error', { error: String((err as Error).message) });
    res.status(500).json({ error: String((err as Error).message) });
  }
});

/** POST /api/business/:id/message — Founder message -> Swarm Bus inject (CEO). */
app.post('/api/business/:id/message', async (req: Request, res: Response) => {
  try {
    const businessId = req.params.id;
    const body = req.body as { content?: string; message?: string };
    const content = body.content ?? body.message;
    if (!content) {
      logger.warn('message_missing_content', { businessId });
      res.status(400).json({ error: 'Missing content or message' });
      return;
    }
    logger.info('message_inject', { businessId, contentLength: content.length });
    await injectFounderMessage(businessId, content);

    const ceoProcess = getAgentsByBusiness(businessId).find((p) => p.agentId === 'ceo');
    if (ceoProcess) {
      ceoProcess.enqueuePrompt(`The founder sent you a message: "${content}". Read your swarm bus inbox and respond.`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('message_inject_error', { error: String((err as Error).message) });
    res.status(500).json({ error: String((err as Error).message) });
  }
});

/** POST /api/agents/spawn — Webhook from Swarm Bus. */
app.post('/api/agents/spawn', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      role?: string;
      business?: string;
      mission?: string;
      macro_objectives?: string[];
      browser_domains?: string[];
      skills?: string[];
      lifecycle?: string;
      parent_agent_id?: string;
    };
    if (!body.role || !body.business || !body.mission) {
      logger.warn('spawn_missing_fields', { hasRole: !!body.role, hasBusiness: !!body.business, hasMission: !!body.mission });
      res.status(400).json({ error: 'Missing role, business, or mission' });
      return;
    }
    logger.info('spawn_request', { role: body.role, business: body.business, parent_agent_id: body.parent_agent_id });
    const result = await spawnAgent({
      role: body.role,
      business: body.business,
      mission: body.mission,
      macro_objectives: body.macro_objectives,
      browser_domains: body.browser_domains,
      skills: body.skills,
      lifecycle: body.lifecycle,
      parent_agent_id: body.parent_agent_id,
    });
    logger.info('spawn_ok', { key: result.agent_key });
    res.status(201).json(result);
  } catch (err) {
    logger.error('spawn_error', { error: String((err as Error).message) });
    res.status(500).json({ error: String((err as Error).message) });
  }
});

/** POST /api/agents/:key/screencast — Receives base64 JPEG frame from Computer Use MCP, broadcasts to SSE. */
app.post('/api/agents/:key/screencast', (req: Request, res: Response) => {
  const { key } = req.params;
  const process = getAgent(key);
  if (!process) {
    logger.warn('screencast_agent_not_found', { key });
    res.status(404).json({ error: 'Agent not found', key });
    return;
  }
  const body = req.body as { frame?: string };
  if (body.frame) {
    logger.debug('screencast_frame', { key, frameLength: body.frame.length });
    process.broadcast({ type: 'screencast_frame', frame: body.frame, agent: key });
  }
  res.status(200).json({ ok: true });
});

/** POST /api/agents/:key/wake — Webhook from Swarm Bus Wake Engine (task_based agents). */
app.post('/api/agents/:key/wake', (req: Request, res: Response) => {
  const { key } = req.params;
  const process = getAgent(key);
  if (!process) {
    res.status(404).json({ error: 'Agent not found', key });
    return;
  }
  if (process.isRunningCycle()) {
    process.wake();
    res.status(200).json({ ok: true, status: 'already_running_woke' });
    return;
  }
  process.wake();
  process.start().catch((err) => logger.error('wake_start_error', { key, error: String((err as Error).message) }));
  res.status(200).json({ ok: true, status: 'woken' });
});

export { app };

const PORT = Number(process.env.ORCHESTRATOR_PORT) || 3000;
if (!process.env.VITEST) {
  app.listen(PORT, () => {
    logger.info('listening', { port: PORT, url: `http://localhost:${PORT}` });
  });
}
