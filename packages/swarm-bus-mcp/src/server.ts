/**
 * Swarm Bus MCP — HTTP transport, P0 tools, header-based identity, /api/register, /api/inject.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { requestIdentity, fromHeaders } from './context.js';
import { handleRegister, handleDeregister } from './api/register.js';
import { handleInject } from './api/inject.js';
import { getAgentsByBusiness, getAllAgents } from './core/registry.js';
import { addEventsSubscriber, broadcastMessageAdded } from './core/events.js';
import { setOnMessageAdded } from './core/store.js';
import { createMessagingTools } from './tools/messaging.js';
import { createSpawningTools } from './tools/spawning.js';
import { createEscalationTools } from './tools/escalation.js';
import { createBudgetTools, getBudget } from './tools/budget.js';
import { createSchedulingTools } from './tools/scheduling.js';
import { createStatusTools } from './tools/status.js';
import { logger } from './logger.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req: Request, _res: Response, next) => {
  logger.debug('request', { method: req.method, path: req.path });
  next();
});

function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'swarm-bus-mcp', version: '0.1.0' },
    { capabilities: {} },
  );

  const messaging = createMessagingTools();
  const spawning = createSpawningTools();

  server.registerTool('swarm_check_inbox', {
    description: messaging.swarm_check_inbox.description,
    inputSchema: messaging.swarm_check_inbox.inputSchema,
  }, messaging.swarm_check_inbox.handler);

  server.registerTool('swarm_send_message', {
    description: messaging.swarm_send_message.description,
    inputSchema: messaging.swarm_send_message.inputSchema,
  }, messaging.swarm_send_message.handler);

  server.registerTool('swarm_broadcast', {
    description: messaging.swarm_broadcast.description,
    inputSchema: messaging.swarm_broadcast.inputSchema,
  }, messaging.swarm_broadcast.handler);

  server.registerTool('swarm_spawn_agent', {
    description: spawning.swarm_spawn_agent.description,
    inputSchema: spawning.swarm_spawn_agent.inputSchema,
  }, spawning.swarm_spawn_agent.handler);

  const escalation = createEscalationTools();
  const budget = createBudgetTools();
  const scheduling = createSchedulingTools();
  const status = createStatusTools();
  server.registerTool('swarm_reply', { description: messaging.swarm_reply.description, inputSchema: messaging.swarm_reply.inputSchema }, messaging.swarm_reply.handler);
  server.registerTool('swarm_escalate', { description: escalation.swarm_escalate.description, inputSchema: escalation.swarm_escalate.inputSchema }, escalation.swarm_escalate.handler);
  server.registerTool('swarm_decision', { description: escalation.swarm_decision.description, inputSchema: escalation.swarm_decision.inputSchema }, escalation.swarm_decision.handler);
  server.registerTool('swarm_request_budget', { description: budget.swarm_request_budget.description, inputSchema: budget.swarm_request_budget.inputSchema }, budget.swarm_request_budget.handler);
  server.registerTool('swarm_approve_budget', { description: budget.swarm_approve_budget.description, inputSchema: budget.swarm_approve_budget.inputSchema }, budget.swarm_approve_budget.handler);
  server.registerTool('swarm_report_spend', { description: budget.swarm_report_spend.description, inputSchema: budget.swarm_report_spend.inputSchema }, budget.swarm_report_spend.handler);
  server.registerTool('swarm_get_budget', { description: budget.swarm_get_budget.description, inputSchema: budget.swarm_get_budget.inputSchema }, budget.swarm_get_budget.handler);
  server.registerTool('swarm_schedule_event', { description: scheduling.swarm_schedule_event.description, inputSchema: scheduling.swarm_schedule_event.inputSchema }, scheduling.swarm_schedule_event.handler);
  server.registerTool('swarm_cancel_event', { description: scheduling.swarm_cancel_event.description, inputSchema: scheduling.swarm_cancel_event.inputSchema }, scheduling.swarm_cancel_event.handler);
  server.registerTool('swarm_list_events', { description: scheduling.swarm_list_events.description, inputSchema: scheduling.swarm_list_events.inputSchema }, scheduling.swarm_list_events.handler);
  server.registerTool('swarm_report_status', { description: status.swarm_report_status.description, inputSchema: status.swarm_report_status.inputSchema }, status.swarm_report_status.handler);
  server.registerTool('swarm_get_business_context', { description: status.swarm_get_business_context.description, inputSchema: status.swarm_get_business_context.inputSchema }, status.swarm_get_business_context.handler);
  server.registerTool('swarm_update_business_context', { description: status.swarm_update_business_context.description, inputSchema: status.swarm_update_business_context.inputSchema }, status.swarm_update_business_context.handler);

  return server;
}

const transports: Record<string, StreamableHTTPServerTransport> = {};

async function handleMcpPost(req: Request, res: Response): Promise<void> {
  const sessionId = (req.headers['mcp-session-id'] as string) ?? undefined;
  const identity = fromHeaders(req.headers);
  if (identity) {
    logger.debug('mcp_post_identity', { agentId: identity.agentId, sessionId: sessionId ?? 'new' });
  } else {
    logger.debug('mcp_post_no_identity', { path: req.path });
  }

  const runWithIdentity = async () => {
    let transport = sessionId ? transports[sessionId] : undefined;

    if (transport) {
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && req.body && isInitializeRequest(req.body)) {
      const newSessionId = randomUUID();
      logger.info('mcp_session_new', { sessionId: newSessionId });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid) => {
          if (sid) transports[sid] = transport;
        },
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          delete transports[sid];
          logger.debug('mcp_session_close', { sessionId: sid });
        }
      };
      const mcpServer = createMcpServer();
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
      id: null,
    });
  };

  if (identity) {
    await requestIdentity.run(identity, runWithIdentity);
  } else {
    await runWithIdentity();
  }
}

async function handleMcpGet(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string;
  const transport = sessionId ? transports[sessionId] : undefined;
  if (!transport) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transport.handleRequest(req, res);
}

async function handleMcpDelete(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string;
  const transport = sessionId ? transports[sessionId] : undefined;
  if (!transport) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transport.handleRequest(req, res);
}

app.post('/mcp', (req, res) => {
  handleMcpPost(req, res).catch((err) => {
    logger.error('mcp_post_error', { error: String((err as Error).message) });
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
  });
});
app.get('/mcp', (req, res) => {
  handleMcpGet(req, res).catch((err) => {
    logger.error('mcp_get_error', { error: String((err as Error).message) });
    if (!res.headersSent) res.status(500).send('Internal server error');
  });
});
app.delete('/mcp', (req, res) => {
  handleMcpDelete(req, res).catch((err) => {
    logger.error('mcp_delete_error', { error: String((err as Error).message) });
    if (!res.headersSent) res.status(500).send('Internal server error');
  });
});

setOnMessageAdded((_agentId, message) => broadcastMessageAdded(message));

function sseHeaders(res: Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

app.get('/api/events', (req: Request, res: Response) => {
  sseHeaders(res);
  addEventsSubscriber(res);
});

app.post('/api/register', handleRegister);
app.post('/api/deregister', handleDeregister);
app.post('/api/inject', handleInject);

app.get('/api/graph', (req: Request, res: Response) => {
  const businessId = req.query.business_id as string | undefined;
  const agents = businessId ? getAgentsByBusiness(businessId) : getAllAgents();
  const nodes = agents.map((a) => ({
    id: a.agent_id,
    role: a.role,
    business_id: a.business_id,
  }));
  const edges = agents
    .filter((a) => a.parent)
    .map((a) => ({ from: a.parent!, to: a.agent_id }));
  res.json({ nodes, edges });
});

app.get('/api/budgets', (req: Request, res: Response) => {
  const businessId = req.query.business_id as string | undefined;
  if (!businessId) {
    res.status(400).json({ error: 'business_id required' });
    return;
  }
  const agents = getAgentsByBusiness(businessId);
  const budgetsList = agents.map((a) => {
    const b = getBudget(a.agent_id) ?? { allocated: 0, spent: 0 };
    return { role: a.role, allocated: b.allocated, spent: b.spent };
  });
  res.json({ budgets: budgetsList });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'swarm-bus-mcp' });
});

const PORT = Number(process.env.SWARM_BUS_PORT) || 3100;
app.listen(PORT, () => {
  logger.info('listening', { port: PORT, url: `http://localhost:${PORT}` });
});
