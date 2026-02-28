import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getBudget, createBudgetTools } from '../src/tools/budget.js';
import * as registry from '../src/core/registry.js';
import type { AgentRegistration } from '../src/types.js';

const mockIdentity = vi.fn();
vi.mock('../src/context.js', () => ({ getIdentity: () => mockIdentity() }));
vi.mock('../src/core/store.js', () => ({
  addToInbox: vi.fn(),
  getInbox: vi.fn(() => []),
}));
vi.mock('../src/core/wake.js', () => ({ scheduleWake: vi.fn() }));

const ceoReg: AgentRegistration = {
  agent_id: 'biz--ceo',
  business_id: 'biz',
  role: 'ceo',
  role_type: 'ceo',
  lifecycle: 'infinite_loop',
  parent: null,
  children: ['biz--mkt'],
};
const mktReg: AgentRegistration = {
  agent_id: 'biz--mkt',
  business_id: 'biz',
  role: 'mkt',
  role_type: 'specialist',
  lifecycle: 'infinite_loop',
  parent: 'biz--ceo',
  children: [],
};

describe('swarm-bus budget', () => {
  beforeEach(() => {
    registry.clearForTesting();
    registry.register(ceoReg);
    registry.register(mktReg);
    mockIdentity.mockReturnValue({ agentId: 'biz--mkt', businessId: 'biz' });
  });

  it('getBudget returns undefined for agent with no budget', () => {
    expect(getBudget('unknown')).toBeUndefined();
  });

  it('createBudgetTools exposes get_budget and report_spend', () => {
    const tools = createBudgetTools();
    expect(tools.swarm_get_budget).toBeDefined();
    expect(tools.swarm_report_spend).toBeDefined();
    expect(tools.swarm_request_budget).toBeDefined();
    expect(tools.swarm_approve_budget).toBeDefined();
  });

  it('swarm_get_budget returns allocated and spent for agent', async () => {
    const tools = createBudgetTools();
    const result = await tools.swarm_get_budget.handler({});
    const data = JSON.parse((result as { content: [{ text: string }] }).content[0].text);
    expect(data).toMatchObject({ allocated: 0, spent: 0 });
  });
});
