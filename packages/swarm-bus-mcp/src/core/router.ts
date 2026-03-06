/**
 * Hierarchy enforcement: who can message whom.
 * CEO: any in business. Department manager: parent (CEO) + own children. Specialist: department manager only.
 */
import { getAgent, resolveRole } from './registry.js';

export async function canSendTo(
  fromAgentId: string,
  toRole: string,
  businessId: string,
): Promise<{ allowed: boolean; toAgentId?: string }> {
  const from = await getAgent(fromAgentId);
  if (!from) return { allowed: false };
  if (from.business_id !== businessId) return { allowed: false };

  const toAgentId = await resolveRole(businessId, toRole);
  if (!toAgentId) return { allowed: false };

  const to = await getAgent(toAgentId);
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

export async function isCEO(agentId: string): Promise<boolean> {
  const a = await getAgent(agentId);
  return a?.role_type === 'ceo';
}
