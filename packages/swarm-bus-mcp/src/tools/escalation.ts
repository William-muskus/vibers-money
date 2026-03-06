import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getIdentity } from '../context.js';
import { getAgent } from '../core/registry.js';
import { addToInbox } from '../core/store.js';
import { scheduleWake } from '../core/wake.js';
import type { Message } from '../types.js';

const pending = new Map<string, { from_agent_id: string }>();

export function createEscalationTools() {
  return {
    swarm_escalate: {
      description: 'Escalate a decision to your manager or CEO.',
      inputSchema: {
        question: z.string(),
        options: z.array(z.string()),
        context: z.string(),
      },
      handler: async (args: { question: string; options: string[]; context: string }) => {
        const { agentId, businessId } = getIdentity();
        const from = await getAgent(agentId);
        if (!from?.parent) throw new Error('No parent');
        const id = `esc-${uuidv4()}`;
        pending.set(id, { from_agent_id: agentId });
        const msg: Message = {
          id: `msg-${uuidv4()}`,
          type: 'escalation',
          from_agent_id: agentId,
          from_role: from.role,
          to_agent_id: from.parent,
          business_id: businessId,
          content: JSON.stringify({ escalationId: id, ...args }),
          priority: 'high',
          timestamp: new Date().toISOString(),
          read: false,
        };
        await addToInbox(from.parent, msg);
        scheduleWake(from.parent);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ escalation_id: id, status: 'pending' }) }] };
      },
    },
    swarm_decision: {
      description: 'Respond to an escalation.',
      inputSchema: { escalation_id: z.string(), decision: z.string(), reasoning: z.string().optional() },
      handler: async (args: { escalation_id: string; decision: string }) => {
        const { agentId, businessId } = getIdentity();
        const esc = pending.get(args.escalation_id);
        if (!esc) throw new Error('Escalation not found');
        const originator = await getAgent(esc.from_agent_id);
        if (!originator || originator.parent !== agentId) {
          throw new Error('Only the parent of the escalating agent can respond to this escalation');
        }
        pending.delete(args.escalation_id);
        const me = await getAgent(agentId);
        const msg: Message = {
          id: `msg-${uuidv4()}`,
          type: 'escalation_response',
          from_agent_id: agentId,
          from_role: me!.role,
          to_agent_id: esc.from_agent_id,
          business_id: businessId,
          content: JSON.stringify({ decision: args.decision }),
          priority: 'normal',
          timestamp: new Date().toISOString(),
          read: false,
        };
        await addToInbox(esc.from_agent_id, msg);
        scheduleWake(esc.from_agent_id);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ delivered: true }) }] };
      },
    },
  };
}
