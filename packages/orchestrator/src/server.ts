/**
 * Orchestrator HTTP server: SSE endpoints, admin API, spawner integration.
 * Load .env first so spawner (and others) see LOCAL_LLM_API_BASE etc. when they load.
 */
import './load-env.js';
import './sentry.js';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import {
  getAgent,
  getAgentsByBusiness,
  getAllAgents,
  getBusinessIds,
} from './registry.js';
import { setBusinessFounder, canAccess as ownershipCanAccess } from './ownership.js';
import { getUsage, recordInferenceUsage } from './usage-store.js';
import {
  createBusinessAndSpawnCEO,
  spawnAgent,
  injectFounderMessage,
  getBusinessTree,
  listBusinessIdsFromDisk,
} from './spawner.js';
import { deriveConceptSlug } from './derive-concept-slug.js';
import { getInferenceConfig, checkInferenceHealth, checkInferenceHealthWithRetry } from './inference-engine.js';
import { logger } from './logger.js';

/** Resolve agents by business id. */
function getProcessesForBusiness(id: string): ReturnType<typeof getAgentsByBusiness> {
  return getAgentsByBusiness(id.trim());
}

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN?.trim() || undefined;
const app = express();
app.use(
  cors({
    origin: FRONTEND_ORIGIN ?? true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Founder-Session-Id'],
    exposedHeaders: ['Content-Type'],
  }),
);
app.use(express.json());

app.use((req: Request, _res: Response, next) => {
  logger.debug('request', { method: req.method, path: req.path });
  next();
});

function getSessionId(req: Request): string | undefined {
  const header = req.headers['x-founder-session-id'];
  if (typeof header === 'string') return header;
  const q = req.query?.session_id;
  const s = Array.isArray(q) ? q[0] : q;
  return typeof s === 'string' ? s : undefined;
}

function requireOwnershipIfSession(businessId: string, req: Request, res: Response): boolean {
  const sessionId = getSessionId(req);
  if (!sessionId) return true;
  if (ownershipCanAccess(businessId, sessionId)) return true;
  res.status(403).json({ error: 'Access denied', businessId });
  return false;
}

function sseHeaders(res: Response): void {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN ?? '*');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

/** GET /api/agents/:key/stream — SSE per agent (activity + screencast). */
app.get('/api/agents/:key/stream', (req: Request, res: Response) => {
  const { key } = req.params;
  const businessId = key.includes('--') ? key.split('--')[0] : key;
  if (!requireOwnershipIfSession(businessId.trim(), req, res)) return;
  let process = getAgent(key);
  if (!process && key.endsWith('--ceo')) {
    process = getAgent(key.slice(0, -'--ceo'.length) + '---ceo');
  }
  if (!process) {
    logger.warn('stream_not_found', { key });
    res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN ?? '*');
    res.status(404).json({ error: 'Agent not found', key });
    return;
  }
  sseHeaders(res);
  process.subscribe(res);
});

/** GET /api/business/:id/stream — SSE for all agents in a business. */
app.get('/api/business/:id/stream', (req: Request, res: Response) => {
  const { id: businessId } = req.params;
  const id = businessId.trim();
  if (!requireOwnershipIfSession(id, req, res)) return;
  const processes = getProcessesForBusiness(id);
  if (processes.length === 0) {
    res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN ?? '*');
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

/** GET /api/admin/businesses — List of business IDs from disk (deleted folders disappear; frontend can clear cache). */
app.get('/api/admin/businesses', async (_req: Request, res: Response) => {
  const businessIds = await listBusinessIdsFromDisk();
  res.json({ businessIds });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'orchestrator' });
});

/** GET /api/inference/health — Local inference engine status and model availability. */
app.get('/api/inference/health', async (_req: Request, res: Response) => {
  const config = getInferenceConfig();
  if (!config) return res.json({ enabled: false });
  const requiredModels = [process.env.LOCAL_LLM_MODEL || 'mistral:7b'];
  const health = await checkInferenceHealth(config, requiredModels);
  res.json({ enabled: true, engine: config.type, ...health });
});

/** GET /api/inference/v1/models — Proxy to inference engine; for usage tracking use POST through this proxy. */
app.get('/api/inference/v1/models', async (req: Request, res: Response) => {
  const config = getInferenceConfig();
  if (!config) {
    res.status(503).json({ error: 'Local inference not configured; set LOCAL_LLM_API_BASE' });
    return;
  }
  const base = config.apiBase.replace(/\/$/, '');
  const url = `${base}/models`;
  try {
    const f = await fetch(url);
    const data = await f.json();
    res.status(f.status).json(data);
  } catch (err) {
    logger.warn('inference_proxy_models_error', { url, error: String((err as Error).message) });
    res.status(502).json({ error: 'Inference engine unreachable' });
  }
});

/** POST /api/inference/v1/chat/completions — Proxy to inference engine and record usage (business_id, role from query). */
app.post('/api/inference/v1/chat/completions', async (req: Request, res: Response) => {
  const config = getInferenceConfig();
  if (!config) {
    res.status(503).json({ error: 'Local inference not configured; set LOCAL_LLM_API_BASE' });
    return;
  }
  const businessId = (req.query.business_id as string)?.trim() ?? '';
  const role = (req.query.role as string)?.trim() ?? '';
  const businessIdHeader = (req.headers['x-business-id'] as string)?.trim();
  const roleHeader = (req.headers['x-agent-role'] as string)?.trim();
  const businessIdFinal = businessId || businessIdHeader || '';
  const roleFinal = role || roleHeader || '';
  const base = config.apiBase.replace(/\/$/, '');
  const url = `${base}/chat/completions`;
  // Force streaming for all requests through the proxy (all Vibe/agent traffic). Token-by-token updates in CEO chat and tiles.
  const bodyToSend = { ...(req.body as object), stream: true };
  const stream = true;
  const start = Date.now();
  try {
    const f = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyToSend),
    });
    if (!f.ok) {
      const text = await f.text();
      const contentType = f.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      res.status(f.status).send(text);
      return;
    }
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (!f.body) {
        res.status(502).json({ error: 'No response body' });
        return;
      }
      const reader = f.body.getReader();
      try {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        while (!(chunk = await reader.read()).done && chunk.value) {
          res.write(Buffer.from(chunk.value));
        }
      } finally {
        reader.releaseLock();
      }
      res.end();
      const latencyMs = Date.now() - start;
      recordInferenceUsage({
        business_id: businessIdFinal || 'unknown',
        role: roleFinal || 'unknown',
        model: process.env.LOCAL_LLM_MODEL || 'mistral:7b',
        engine: config.type,
        prompt_tokens: 0,
        completion_tokens: 0,
        latency_ms: latencyMs,
      });
      return;
    }
    const data = (await f.json()) as {
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const latencyMs = Date.now() - start;
    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;
    const model = data.model ?? process.env.LOCAL_LLM_MODEL ?? 'mistral:7b';
    recordInferenceUsage({
      business_id: businessIdFinal || 'unknown',
      role: roleFinal || 'unknown',
      model,
      engine: config.type,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      latency_ms: latencyMs,
    });
    res.status(f.status).json(data);
  } catch (err) {
    logger.warn('inference_proxy_chat_error', { url, error: String((err as Error).message) });
    res.status(502).json({ error: 'Inference engine unreachable' });
  }
});

/** POST /api/business/create — Create business + spawn CEO. */
app.post('/api/business/create', async (req: Request, res: Response) => {
  try {
    const body = req.body as { business_id?: string; name?: string; founder_prompt?: string; founder_session_id?: string };
    const businessId = body.business_id?.trim() ?? (body.name ? await deriveConceptSlug(body.name) : undefined);
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
    if (body.founder_session_id) {
      setBusinessFounder(businessId, body.founder_session_id);
    }
    logger.info('business_create_ok', { businessId, key: result.agentKey });
    res.status(201).json(result);
  } catch (err) {
    logger.error('business_create_error', { error: String((err as Error).message) });
    res.status(500).json({ error: String((err as Error).message) });
  }
});

/** GET /api/business/:id/can-access — Check if session can access business. */
app.get('/api/business/:id/can-access', (req: Request, res: Response) => {
  const businessId = req.params.id;
  const sessionId = getSessionId(req);
  const allowed = !!sessionId && ownershipCanAccess(businessId, sessionId);
  res.json({ allowed });
});

/** GET /api/business/:id/usage — Per-business token/API usage for cost dashboard. */
app.get('/api/business/:id/usage', (req: Request, res: Response) => {
  const businessId = req.params.id?.trim();
  if (!businessId) {
    res.status(400).json({ error: 'business_id required' });
    return;
  }
  if (!requireOwnershipIfSession(businessId, req, res)) return;
  const usage = getUsage(businessId);
  res.json(usage);
});

/** POST /api/business/link-session — Link business to founder session (e.g. after Stripe). */
app.post('/api/business/link-session', (req: Request, res: Response) => {
  const body = req.body as { business_id?: string; founder_session_id?: string };
  if (!body.business_id || !body.founder_session_id) {
    res.status(400).json({ error: 'Missing business_id or founder_session_id' });
    return;
  }
  setBusinessFounder(body.business_id, body.founder_session_id);
  logger.info('business_link_session', { businessId: body.business_id });
  res.json({ ok: true });
});

/** POST /api/business/:id/message — Founder message -> Swarm Bus inject (CEO). */
app.post('/api/business/:id/message', async (req: Request, res: Response) => {
  try {
    const businessId = req.params.id;
    if (!requireOwnershipIfSession(businessId, req, res)) return;
    const body = req.body as { content?: string; message?: string };
    const content = body.content ?? body.message;
    if (!content) {
      logger.warn('message_missing_content', { businessId });
      res.status(400).json({ error: 'Missing content or message' });
      return;
    }
    logger.info('message_inject', { businessId, contentLength: content.length });
    await injectFounderMessage(businessId, content);

    const ceoProcess = getProcessesForBusiness(businessId).find((p) => p.agentId === 'ceo');
    if (ceoProcess) {
      ceoProcess.enqueuePrompt(`The founder sent you a message: "${content}". Reply to the founder in your next response — they see your reply in the chat. Then check your swarm bus inbox if needed.`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('message_inject_error', { error: String((err as Error).message) });
    res.status(500).json({ error: String((err as Error).message) });
  }
});

/** GET /api/business/:id/status — Whether this business's agents are paused. */
app.get('/api/business/:id/status', (req: Request, res: Response) => {
  const businessId = req.params.id;
  if (!requireOwnershipIfSession(businessId, req, res)) return;
  const processes = getProcessesForBusiness(businessId);
  const paused = processes.length > 0 && processes.every((p) => p.isPaused());
  res.json({ paused });
});

/** GET /api/business/:id/tree — Filesystem tree (knowledge/, agents/<role>/workspace/, …). */
app.get('/api/business/:id/tree', async (req: Request, res: Response) => {
  const businessId = req.params.id;
  if (!requireOwnershipIfSession(businessId, req, res)) return;
  try {
    const tree = await getBusinessTree(businessId);
    res.json({ tree });
  } catch (err) {
    logger.error('business_tree_error', { businessId, error: String((err as Error).message) });
    res.status(500).json({ error: String((err as Error).message) });
  }
});

/** POST /api/business/:id/pause — Put the infinite loop on hold for all agents in this business. */
app.post('/api/business/:id/pause', (req: Request, res: Response) => {
  const businessId = req.params.id;
  if (!requireOwnershipIfSession(businessId, req, res)) return;
  const processes = getProcessesForBusiness(businessId);
  for (const p of processes) {
    p.pause();
  }
  logger.info('business_pause', { businessId, agentCount: processes.length });
  res.json({ ok: true, paused: true });
});

/** POST /api/business/:id/resume — Resume the loop for all agents in this business. */
app.post('/api/business/:id/resume', (req: Request, res: Response) => {
  const businessId = req.params.id;
  if (!requireOwnershipIfSession(businessId, req, res)) return;
  const processes = getProcessesForBusiness(businessId);
  for (const p of processes) {
    p.resume();
  }
  logger.info('business_resume', { businessId, agentCount: processes.length });
  res.json({ ok: true, paused: false });
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
    if (body.role.toLowerCase() === 'ceo') {
      logger.warn('spawn_ceo_rejected', { business: body.business });
      res.status(400).json({ error: 'Cannot spawn a CEO — there is exactly one CEO per business, created when the business is created.' });
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
  if (key.endsWith('--ceo')) {
    process.enqueuePrompt(
      'You have new messages from your team. Check your swarm bus inbox (swarm_check_inbox), then respond briefly to each director with acknowledgment or next steps. Keep responses concise.',
    );
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
    const inferenceConfig = getInferenceConfig();
    if (inferenceConfig) {
      logger.info(`Using ${inferenceConfig.type} inference at ${inferenceConfig.apiBase}`);
      const requiredModels = [process.env.LOCAL_LLM_MODEL || 'mistral:7b'];
      checkInferenceHealthWithRetry(inferenceConfig, requiredModels, ({ healthy, available, missing }) => {
        if (healthy) logger.info('Inference server healthy', { available, missing });
        else
          logger.warn('Inference server not reachable — is the Rust inference server running on 8080?', {
            apiBase: inferenceConfig.apiBase,
            healthEndpoint: inferenceConfig.healthEndpoint,
          });
      });
    }
  });
}
