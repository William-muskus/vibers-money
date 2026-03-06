import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getIdentity } from '../context.js';
import { getAgent } from '../core/registry.js';
import { addToInbox } from '../core/store.js';
import { scheduleWake } from '../core/wake.js';
import type { Message } from '../types.js';

const budgets = new Map<string, { allocated: number; spent: number }>();
const requests = new Map<string, { from_agent_id: string }>();

/** Get budget for an agent (for admin/API use). */
export function getBudget(agentId: string): { allocated: number; spent: number } | undefined {
  return budgets.get(agentId);
}

export function createBudgetTools() {
  return {
    swarm_request_budget: {
      description: 'Request budget from your manager.',
      inputSchema: { amount: z.number(), justification: z.string(), category: z.string().optional() },
      handler: async (args: { amount: number; justification: string }) => {
        const { agentId, businessId } = getIdentity();
        const from = await getAgent(agentId);
        if (!from?.parent) throw new Error('No parent');
        const rid = `budget-${uuidv4()}`;
        requests.set(rid, { from_agent_id: agentId });
        const msg: Message = {
          id: `msg-${uuidv4()}`,
          type: 'budget_request',
          from_agent_id: agentId,
          from_role: from.role,
          to_agent_id: from.parent,
          business_id: businessId,
          content: JSON.stringify({ requestId: rid, amount: args.amount, justification: args.justification }),
          priority: 'normal',
          timestamp: new Date().toISOString(),
          read: false,
        };
        await addToInbox(from.parent, msg);
        scheduleWake(from.parent);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ request_id: rid, status: 'pending' }) }] };
      },
    },
    swarm_approve_budget: {
      description: 'Approve or deny a budget request.',
      inputSchema: { request_id: z.string(), approved_amount: z.number(), reasoning: z.string().optional() },
      handler: async (args: { request_id: string; approved_amount: number }) => {
        const { agentId } = getIdentity();
        const r = requests.get(args.request_id);
        if (!r) throw new Error('Request not found');
        const requester = await getAgent(r.from_agent_id);
        if (!requester || requester.parent !== agentId) {
          throw new Error('Only the parent of the requester can approve this budget request');
        }
        requests.delete(args.request_id);
        if (args.approved_amount > 0) {
          const b = budgets.get(r.from_agent_id) ?? { allocated: 0, spent: 0 };
          budgets.set(r.from_agent_id, { ...b, allocated: b.allocated + args.approved_amount });
        }
        const me = await getAgent(agentId);
        const msg: Message = {
          id: `msg-${uuidv4()}`,
          type: 'budget_response',
          from_agent_id: agentId,
          from_role: me!.role,
          to_agent_id: r.from_agent_id,
          business_id: me!.business_id,
          content: JSON.stringify({ approved_amount: args.approved_amount }),
          priority: 'normal',
          timestamp: new Date().toISOString(),
          read: false,
        };
        await addToInbox(r.from_agent_id, msg);
        scheduleWake(r.from_agent_id);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ approved: args.approved_amount }) }] };
      },
    },
    swarm_report_spend: {
      description: 'Report spend. Deducts from your budget.',
      inputSchema: { amount: z.number(), description: z.string(), category: z.string().optional() },
      handler: async (args: { amount: number; description: string }) => {
        const { agentId } = getIdentity();
        const b = budgets.get(agentId) ?? { allocated: 0, spent: 0 };
        if (args.amount > b.allocated - b.spent) throw new Error('Insufficient budget');
        const newSpent = b.spent + args.amount;
        budgets.set(agentId, { ...b, spent: newSpent });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ recorded: true, remaining_budget: b.allocated - newSpent }) }] };
      },
    },
    swarm_get_budget: {
      description: 'Check your budget.',
      inputSchema: {},
      handler: async () => {
        const { agentId } = getIdentity();
        const b = budgets.get(agentId) ?? { allocated: 0, spent: 0 };
        return { content: [{ type: 'text' as const, text: JSON.stringify({ allocated: b.allocated, spent: b.spent, remaining: b.allocated - b.spent }) }] };
      },
    },
  };
}
