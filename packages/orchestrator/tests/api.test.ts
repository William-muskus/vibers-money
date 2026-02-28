import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import { registerAgent, clearForTesting } from '../src/registry.js';
import type { AgentProcess } from '../src/agent-process.js';

vi.mock('../src/spawner.js', () => ({
  createBusinessAndSpawnCEO: vi.fn().mockResolvedValue({ businessId: 'test-co', agentKey: 'test-co--ceo' }),
  spawnAgent: vi.fn().mockResolvedValue({ agent_key: 'test-co--mkt' }),
  injectFounderMessage: vi.fn().mockResolvedValue(undefined),
}));

const mockProcess = (key: string, businessId: string): AgentProcess =>
  ({
    key,
    businessId,
    subscribe: vi.fn(),
    broadcast: vi.fn(),
    isRunningCycle: vi.fn().mockReturnValue(false),
    start: vi.fn().mockResolvedValue(undefined),
    wake: vi.fn(),
    enqueuePrompt: vi.fn(),
    agentId: key.split('--')[1] ?? key,
  }) as unknown as AgentProcess;

describe('orchestrator API', () => {
  beforeEach(() => {
    clearForTesting();
  });

  it('GET /health returns 200 and status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'orchestrator' });
  });

  it('GET /api/admin/stats returns counts', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ businessCount: 0, agentCount: 0 });
  });

  it('GET /api/admin/agents returns empty list when no agents', async () => {
    const res = await request(app).get('/api/admin/agents');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ agents: [] });
  });

  it('GET /api/admin/businesses returns empty list', async () => {
    const res = await request(app).get('/api/admin/businesses');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ businessIds: [] });
  });

  it('POST /api/business/create returns 201 with mocked spawner', async () => {
    const res = await request(app)
      .post('/api/business/create')
      .send({ name: 'Test Co', founder_prompt: 'Build things' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ businessId: 'test-co', agentKey: 'test-co--ceo' });
  });

  it('POST /api/business/create returns 400 when name missing', async () => {
    const res = await request(app).post('/api/business/create').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing');
  });

  it('POST /api/business/:id/message returns 200', async () => {
    const res = await request(app)
      .post('/api/business/any-id/message')
      .send({ content: 'Hello CEO' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('POST /api/business/:id/message returns 400 when content missing', async () => {
    const res = await request(app).post('/api/business/any-id/message').send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/agents/spawn returns 201 with valid body', async () => {
    const res = await request(app)
      .post('/api/agents/spawn')
      .send({ role: 'mkt', business: 'biz', mission: 'Do marketing' });
    expect(res.status).toBe(201);
    expect(res.body.agent_key).toBe('test-co--mkt');
  });

  it('POST /api/agents/spawn returns 400 when role missing', async () => {
    const res = await request(app)
      .post('/api/agents/spawn')
      .send({ business: 'biz', mission: 'Do stuff' });
    expect(res.status).toBe(400);
  });

  it('GET /api/agents/:key/stream returns 404 when agent not found', async () => {
    const res = await request(app).get('/api/agents/missing--ceo/stream');
    expect(res.status).toBe(404);
  });

  it('GET /api/business/:id/stream returns 404 when no agents', async () => {
    const res = await request(app).get('/api/business/nobiz/stream');
    expect(res.status).toBe(404);
  });

  it('POST /api/agents/:key/wake returns 404 when agent not found', async () => {
    const res = await request(app).post('/api/agents/missing--ceo/wake');
    expect(res.status).toBe(404);
  });

  it('POST /api/agents/:key/wake returns 200 when agent exists', async () => {
    registerAgent(mockProcess('wake-test--ceo', 'wake-test'));
    const res = await request(app).post('/api/agents/wake-test--ceo/wake');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
