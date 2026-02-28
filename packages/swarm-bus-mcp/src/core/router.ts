/**
 * Hierarchy enforcement: who can message whom.
 * CEO: any in business. Department manager: parent (CEO) + own children. Specialist: department manager only.
 */
import { getAgent, resolveRole } from './registry.js';

export function canSendTo(fromAgentId: string, toRole: string, businessId: string): { allowed: boolean; toAgentId?: string } {
  const from = getAgent(fromAgentId);
  if (!from) return { allowed: false };
  if (from.business_id !== businessId) return { allowed: false };

  const toAgentId = resolveRole(businessId, toRole);
  if (!toAgentId) return { allowed: false };

  const to = getAgent(toAgentId);
  if (!to) return { allowed: false };

  if (from.role_type === 'ceo') return { allowed: true, toAgentId };
  if (from.role_type === 'department_manager') {
    if (to.agent_id === from.parent) return { allowed: true, toAgentId };
    if (from.children.includes(to.agent_id)) return { allowed: true, toAgentId };
    return { allowed: false };
  }
  if (from.role_type === 'specialist') {
    if (to.agent_id === from.parent) return { allowed: true, toAgentId };
    return { allowed: false };
  }
  return { allowed: false };
}

export function isCEO(agentId: string): boolean {
  const a = getAgent(agentId);
  return a?.role_type === 'ceo';
}
