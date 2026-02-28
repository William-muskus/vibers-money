import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAgent,
  unregisterAgent,
  getAgent,
  getAgentsByBusiness,
  getAllAgents,
  getBusinessIds,
  clearForTesting,
} from '../src/registry.js';

type AgentProcess = import('../src/agent-process.js').AgentProcess;
const mockProcess = (key: string, businessId: string): AgentProcess =>
  ({ key, businessId }) as unknown as AgentProcess;

describe('orchestrator registry', () => {
  beforeEach(() => {
    clearForTesting();
    registerAgent(mockProcess('a--ceo', 'a'));
    registerAgent(mockProcess('a--mkt', 'a'));
    registerAgent(mockProcess('b--ceo', 'b'));
  });

  it('getAgent returns process by key', () => {
    const p = getAgent('a--ceo');
    expect(p).toBeDefined();
    expect(p!.key).toBe('a--ceo');
  });

  it('getAgent returns undefined for unknown key', () => {
    expect(getAgent('x--ceo')).toBeUndefined();
  });

  it('getAgentsByBusiness returns all agents for business', () => {
    const list = getAgentsByBusiness('a');
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.key).sort()).toEqual(['a--ceo', 'a--mkt']);
  });

  it('getAgentsByBusiness returns empty for unknown business', () => {
    expect(getAgentsByBusiness('x')).toEqual([]);
  });

  it('getAllAgents returns all registered', () => {
    const all = getAllAgents();
    expect(all).toHaveLength(3);
  });

  it('getBusinessIds returns unique business ids', () => {
    const ids = getBusinessIds();
    expect(ids).toHaveLength(2);
    expect(ids.sort()).toEqual(['a', 'b']);
  });

  it('unregisterAgent removes process and cleans business list', () => {
    const p = getAgent('a--mkt');
    unregisterAgent(p!);
    expect(getAgent('a--mkt')).toBeUndefined();
    expect(getAgentsByBusiness('a')).toHaveLength(1);
    expect(getAgentsByBusiness('a')[0].key).toBe('a--ceo');
  });

  it('unregisterAgent removes business when last agent leaves', () => {
    unregisterAgent(getAgent('b--ceo')!);
    expect(getBusinessIds()).not.toContain('b');
  });
});
