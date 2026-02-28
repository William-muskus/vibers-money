/**
 * Agent registration and org chart. Identity from X-Agent-Id + X-Business-Id headers.
 */
import type { AgentRegistration } from '../types.js';

const agents = new Map<string, AgentRegistration>();

export function register(reg: AgentRegistration): void {
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

export function deregister(agentId: string): void {
  const reg = agents.get(agentId);
  if (reg?.parent) {
    const parent = agents.get(reg.parent);
    if (parent) {
      parent.children = parent.children.filter((id) => id !== agentId);
    }
  }
  agents.delete(agentId);
}

export function getAgent(agentId: string): AgentRegistration | undefined {
  return agents.get(agentId);
}

/** Resolve role name to agent_id within a business. */
export function resolveRole(businessId: string, role: string): string | undefined {
  const candidateId = `${businessId}--${role}`;
  const a = agents.get(candidateId);
  return a ? a.agent_id : undefined;
}

/** Get all agents in a business. */
export function getAgentsByBusiness(businessId: string): AgentRegistration[] {
  return [...agents.values()].filter((a) => a.business_id === businessId);
}

export function getAllAgents(): AgentRegistration[] {
  return [...agents.values()];
}

/** Only for tests: clear all state. */
export function clearForTesting(): void {
  agents.clear();
}
