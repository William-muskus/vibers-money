import { describe, it, expect, beforeEach } from 'vitest';
import {
  register,
  deregister,
  getAgent,
  resolveRole,
  getAgentsByBusiness,
  getAllAgents,
  clearForTesting,
} from '../src/core/registry.js';
import type { AgentRegistration } from '../src/types.js';

const reg = (agent_id: string, business_id: string, role: string, parent: string | null): AgentRegistration => ({
  agent_id,
  business_id,
  role,
  role_type: parent === null ? 'ceo' : 'specialist',
  lifecycle: 'infinite_loop',
  parent,
  children: [],
});

describe('swarm-bus registry', () => {
  beforeEach(async () => {
    await clearForTesting();
    await register(reg('biz--ceo', 'biz', 'ceo', null));
    await register(reg('biz--mkt', 'biz', 'mkt', 'biz--ceo'));
    await register(reg('biz--eng', 'biz', 'eng', 'biz--ceo'));
    await register(reg('other--ceo', 'other', 'ceo', null));
  });

  it('getAgent returns registration by id', async () => {
    const a = await getAgent('biz--mkt');
    expect(a).toBeDefined();
    expect(a!.role).toBe('mkt');
    expect(a!.parent).toBe('biz--ceo');
  });

  it('resolveRole returns agent_id for business--role', async () => {
    expect(await resolveRole('biz', 'ceo')).toBe('biz--ceo');
    expect(await resolveRole('biz', 'mkt')).toBe('biz--mkt');
    expect(await resolveRole('biz', 'unknown')).toBeUndefined();
  });

  it('getAgentsByBusiness returns all agents for business', async () => {
    const list = await getAgentsByBusiness('biz');
    expect(list).toHaveLength(3);
    expect(list.map((a) => a.agent_id).sort()).toEqual(['biz--ceo', 'biz--eng', 'biz--mkt']);
  });

  it('getAllAgents returns all', async () => {
    expect(await getAllAgents()).toHaveLength(4);
  });

  it('deregister removes agent and updates parent children', async () => {
    const ceo = await getAgent('biz--ceo');
    expect(ceo!.children).toContain('biz--mkt');
    await deregister('biz--mkt');
    expect(await getAgent('biz--mkt')).toBeUndefined();
    expect((await getAgent('biz--ceo'))!.children).not.toContain('biz--mkt');
  });
});
