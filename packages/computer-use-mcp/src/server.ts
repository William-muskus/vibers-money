/**
 * Computer Use MCP — screenshot, navigate, click, type via CDP.
 */
import './load-env.js';
import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { requestIdentity, fromHeaders } from './context.js';
import { createVisionTools } from './tools/vision.js';
import { createNavigationTools } from './tools/navigation.js';
import { createInteractionTools } from './tools/interaction.js';
import { createTabTools } from './tools/tabs.js';
import { createAdvancedInteractionTools } from './tools/advanced-interaction.js';
import { setAllowlist } from './security/allowlist.js';
import { ensureChromeWithRemoteDebugging, killLaunchedChrome } from './chrome-launcher.js';
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
    { name: 'computer-use-mcp', version: '0.1.0' },
    { capabilities: {} },
  );

  const vision = createVisionTools();
  const nav = createNavigationTools();
  const interaction = createInteractionTools();
  const tabs = createTabTools();
  const advanced = createAdvancedInteractionTools();

  server.registerTool('screenshot', {
    description: vision.screenshot.description,
    inputSchema: vision.screenshot.inputSchema,
  }, vision.screenshot.handler);

  server.registerTool('get_page_info', {
    description: vision.get_page_info.description,
    inputSchema: vision.get_page_info.inputSchema,
  }, vision.get_page_info.handler);

  server.registerTool('navigate', {
    description: nav.navigate.description,
    inputSchema: nav.navigate.inputSchema,
  }, nav.navigate.handler);

  server.registerTool('wait', {
    description: nav.wait.description,
    inputSchema: nav.wait.inputSchema,
  }, nav.wait.handler);

  server.registerTool('click', {
    description: interaction.click.description,
    inputSchema: interaction.click.inputSchema,
  }, interaction.click.handler);

  server.registerTool('type', {
    description: interaction.type.description,
    inputSchema: interaction.type.inputSchema,
  }, interaction.type.handler);

  server.registerTool('tab_list', { description: tabs.tab_list.description, inputSchema: tabs.tab_list.inputSchema }, tabs.tab_list.handler);
  server.registerTool('tab_open', { description: tabs.tab_open.description, inputSchema: tabs.tab_open.inputSchema }, tabs.tab_open.handler);
  server.registerTool('tab_switch', { description: tabs.tab_switch.description, inputSchema: tabs.tab_switch.inputSchema }, tabs.tab_switch.handler);
  server.registerTool('tab_close', { description: tabs.tab_close.description, inputSchema: tabs.tab_close.inputSchema }, tabs.tab_close.handler);

  server.registerTool('double_click', { description: advanced.double_click.description, inputSchema: advanced.double_click.inputSchema }, advanced.double_click.handler);
  server.registerTool('hover', { description: advanced.hover.description, inputSchema: advanced.hover.inputSchema }, advanced.hover.handler);
  server.registerTool('press', { description: advanced.press.description, inputSchema: advanced.press.inputSchema }, advanced.press.handler);
  server.registerTool('scroll', { description: advanced.scroll.description, inputSchema: advanced.scroll.inputSchema }, advanced.scroll.handler);
  server.registerTool('drag', { description: advanced.drag.description, inputSchema: advanced.drag.inputSchema }, advanced.drag.handler);
  server.registerTool('drag_offset', { description: advanced.drag_offset.description, inputSchema: advanced.drag_offset.inputSchema }, advanced.drag_offset.handler);
  server.registerTool('select_option', { description: advanced.select_option.description, inputSchema: advanced.select_option.inputSchema }, advanced.select_option.handler);

  return server;
}

const transports: Record<string, StreamableHTTPServerTransport> = {};

async function handleMcpPost(req: Request, res: Response): Promise<void> {
  const sessionId = (req.headers['mcp-session-id'] as string) ?? undefined;
  const identity = fromHeaders(req.headers);
  if (identity) logger.debug('mcp_post_identity', { agentId: identity.agentId, sessionId: sessionId ?? 'new' });

  const runWithIdentity = async () => {
    let transport = sessionId ? transports[sessionId] : undefined;

    if (transport) {
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && req.body && isInitializeRequest(req.body)) {
      const newSid = randomUUID();
      logger.info('mcp_session_new', { sessionId: newSid });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSid,
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

app.post('/mcp', (req, res) => {
  handleMcpPost(req, res).catch((err) => {
    logger.error('mcp_post_error', { error: String((err as Error).message) });
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
  });
});

app.post('/api/allowlist', (req: Request, res: Response) => {
  const body = req.body as { agent_id?: string; domains?: string[] };
  const agent_id = body.agent_id;
  const domains = Array.isArray(body.domains) ? body.domains : [];
  if (!agent_id) {
    res.status(400).json({ error: 'Missing agent_id' });
    return;
  }
  setAllowlist(agent_id, domains);
  res.json({ ok: true });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'computer-use-mcp' });
});

const PORT = Number(process.env.COMPUTER_USE_PORT) || 3200;

function registerShutdownHooks(): void {
  const onShutdown = () => {
    killLaunchedChrome();
  };
  process.on('SIGINT', onShutdown);
  process.on('SIGTERM', onShutdown);
  process.on('exit', onShutdown);
}

await ensureChromeWithRemoteDebugging();
registerShutdownHooks();

app.listen(PORT, () => {
  logger.info('listening', { port: PORT, url: `http://localhost:${PORT}` });
});
