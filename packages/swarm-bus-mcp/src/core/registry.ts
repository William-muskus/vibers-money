/**
 * Agent registration and org chart. Uses Redis when REDIS_URL is set, otherwise in-memory (local dev).
 */
import type { AgentRegistration } from '../types.js';
import { getRedis } from './redis.js';

const agents = new Map<string, AgentRegistration>();

const AGENT_PREFIX = 'sb:agent:';
const BUSINESS_AGENTS_PREFIX = 'sb:business:';
const ROLE_PREFIX = 'sb:role:';
const ALL_AGENTS_KEY = 'sb:agents';

function businessKey(businessId: string): string {
  return `${BUSINESS_AGENTS_PREFIX}${businessId}:agents`;
}

function roleKey(businessId: string, role: string): string {
  return `${ROLE_PREFIX}${businessId}:${role}`;
}

export async function register(reg: AgentRegistration): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    if (reg.parent) {
      const parentJson = await redis.get(`${AGENT_PREFIX}${reg.parent}`);
      if (parentJson) {
        const parent = JSON.parse(parentJson) as AgentRegistration;
        if (!parent.children.includes(reg.agent_id)) {
          parent.children = [...parent.children, reg.agent_id];
          await redis.set(`${AGENT_PREFIX}${reg.parent}`, JSON.stringify(parent));
        }
      }
    }
    await redis.set(`${AGENT_PREFIX}${reg.agent_id}`, JSON.stringify(reg));
    await redis.sadd(businessKey(reg.business_id), reg.agent_id);
    await redis.set(roleKey(reg.business_id, reg.role), reg.agent_id);
    await redis.sadd(ALL_AGENTS_KEY, reg.agent_id);
    return;
  }
  agents.set(reg.agent_id, reg);
  if (reg.parent) {
    const parent = agents.get(reg.parent);
    if (parent) {
      if (!parent.children.includes(reg.agent_id)) {
        parent.children = [...parent.children, reg.agent_id];
      }
    }
  }
}

export async function deregister(agentId: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    const regJson = await redis.get(`${AGENT_PREFIX}${agentId}`);
    if (regJson) {
      const reg = JSON.parse(regJson) as AgentRegistration;
      if (reg.parent) {
        const parentJson = await redis.get(`${AGENT_PREFIX}${reg.parent}`);
        if (parentJson) {
          const parent = JSON.parse(parentJson) as AgentRegistration;
          parent.children = parent.children.filter((id) => id !== agentId);
          await redis.set(`${AGENT_PREFIX}${reg.parent}`, JSON.stringify(parent));
        }
      }
      await redis.srem(businessKey(reg.business_id), agentId);
      await redis.del(roleKey(reg.business_id, reg.role));
      await redis.srem(ALL_AGENTS_KEY, agentId);
    }
    await redis.del(`${AGENT_PREFIX}${agentId}`);
    return;
  }
  const reg = agents.get(agentId);
  if (reg?.parent) {
    const parent = agents.get(reg.parent);
    if (parent) {
      parent.children = parent.children.filter((id) => id !== agentId);
    }
  }
  agents.delete(agentId);
}

export async function getAgent(agentId: string): Promise<AgentRegistration | undefined> {
  const redis = await getRedis();
  if (redis) {
    const json = await redis.get(`${AGENT_PREFIX}${agentId}`);
    return json ? (JSON.parse(json) as AgentRegistration) : undefined;
  }
  return agents.get(agentId);
}

export async function resolveRole(businessId: string, role: string): Promise<string | undefined> {
  const redis = await getRedis();
  if (redis) {
    const agentId = await redis.get(roleKey(businessId, role));
    return agentId ?? undefined;
  }
  const candidateId = `${businessId}--${role}`;
  const a = agents.get(candidateId);
  return a ? a.agent_id : undefined;
}

export async function getAgentsByBusiness(businessId: string): Promise<AgentRegistration[]> {
  const redis = await getRedis();
  if (redis) {
    const ids = await redis.smembers(businessKey(businessId));
    const out: AgentRegistration[] = [];
    for (const id of ids) {
      const json = await redis.get(`${AGENT_PREFIX}${id}`);
      if (json) out.push(JSON.parse(json) as AgentRegistration);
    }
    return out;
  }
  return [...agents.values()].filter((a) => a.business_id === businessId);
}

export async function getAllAgents(): Promise<AgentRegistration[]> {
  const redis = await getRedis();
  if (redis) {
    const ids = await redis.smembers(ALL_AGENTS_KEY);
    const out: AgentRegistration[] = [];
    for (const id of ids) {
      const json = await redis.get(`${AGENT_PREFIX}${id}`);
      if (json) out.push(JSON.parse(json) as AgentRegistration);
    }
    return out;
  }
  return [...agents.values()];
}

/** Only for tests: clear all state. In Redis this clears only in-memory cache; use a test Redis DB for tests. */
export async function clearForTesting(): Promise<void> {
  agents.clear();
  const redis = await getRedis();
  if (redis) {
    const keys = await redis.keys('sb:*');
    if (keys.length > 0) await redis.del(...keys);
  }
}
