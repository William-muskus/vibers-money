/**
 * Minimal MCP server on the orchestrator: CEO calls `set_awaiting_founder` to set runtime wait state
 * (no text heuristics). Same HTTP MCP pattern as Swarm Bus.
 */
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Express, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getAgent } from './registry.js';
import { logger } from './logger.js';

export interface OrchestratorMcpIdentity {
  role: string;
  businessId: string;
  agentKey: string;
}

const mcpIdentity = new AsyncLocalStorage<OrchestratorMcpIdentity>();

function fromHeaders(headers: Record<string, string | string[] | undefined>): OrchestratorMcpIdentity | null {
  const role = headers['x-agent-id'];
  const businessId = headers['x-business-id'];
  const r = typeof role === 'string' ? role : undefined;
  const b = typeof businessId === 'string' ? businessId : undefined;
  if (!r || !b) return null;
  return { role: r, businessId: b, agentKey: `${b}--${r}` };
}

function getMcpIdentity(): OrchestratorMcpIdentity {
  const id = mcpIdentity.getStore();
  if (!id) throw new Error('Missing X-Agent-Id or X-Business-Id');
  return id;
}

function createOrchestratorMcpServer(): McpServer {
  const server = new McpServer({ name: 'orchestrator', version: '0.1.0' }, { capabilities: {} });

  server.registerTool(
    'set_awaiting_founder',
    {
      description:
        'CEO only. Call with wait=true when you need the founder to answer before you continue (no inbox idle, deferred team prompts). Your question still goes in your normal assistant message. Call after set_awaiting_founder(wait=true) with wait=false only if you must cancel that wait.',
      inputSchema: {
        wait: z.boolean().describe('true = pause CEO wake/idle until the founder sends a chat message'),
      },
    },
    async (args: { wait: boolean }) => {
      const { agentKey } = getMcpIdentity();
      if (!agentKey.endsWith('--ceo')) {
        throw new Error('set_awaiting_founder is only available to the CEO agent');
      }
      const proc = getAgent(agentKey);
      if (!proc) {
        throw new Error('CEO process not registered with orchestrator');
      }
      proc.setWaitingForFounderAnswer(args.wait);
      logger.info('mcp_set_awaiting_founder', { agentKey, wait: args.wait });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, awaiting_founder: args.wait }) }],
      };
    },
  );

  return server;
}

const transports: Record<string, StreamableHTTPServerTransport> = {};

async function handleMcpPost(req: Request, res: Response): Promise<void> {
  const sessionId = (req.headers['mcp-session-id'] as string) ?? undefined;
  const identity = fromHeaders(req.headers);
  if (identity) {
    logger.debug('orchestrator_mcp_post', { agentKey: identity.agentKey, sessionId: sessionId ?? 'new' });
  }

  const run = async () => {
    let transport = sessionId ? transports[sessionId] : undefined;

    if (transport) {
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && req.body && isInitializeRequest(req.body)) {
      const newSessionId = randomUUID();
      logger.info('orchestrator_mcp_session_new', { sessionId: newSessionId });
      const tr = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid) => {
          if (sid) transports[sid] = tr;
        },
      });
      tr.onclose = () => {
        const sid = tr.sessionId;
        if (sid) {
          delete transports[sid];
          logger.debug('orchestrator_mcp_session_close', { sessionId: sid });
        }
      };
      const mcpServer = createOrchestratorMcpServer();
      await mcpServer.connect(tr);
      await tr.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
      id: null,
    });
  };

  if (identity) {
    await mcpIdentity.run(identity, run);
  } else {
    await run();
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

export function mountOrchestratorMcp(app: Express): void {
  app.post('/mcp', (req, res) => {
    handleMcpPost(req, res).catch((err) => {
      logger.error('orchestrator_mcp_post_error', { error: String((err as Error).message) });
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    });
  });
  app.get('/mcp', (req, res) => {
    handleMcpGet(req, res).catch((err) => {
      logger.error('orchestrator_mcp_get_error', { error: String((err as Error).message) });
      if (!res.headersSent) res.status(500).send('Internal server error');
    });
  });
  app.delete('/mcp', (req, res) => {
    handleMcpDelete(req, res).catch((err) => {
      logger.error('orchestrator_mcp_delete_error', { error: String((err as Error).message) });
      if (!res.headersSent) res.status(500).send('Internal server error');
    });
  });
}
