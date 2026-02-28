/**
 * P1: swarm_report_status, swarm_get_business_context, swarm_update_business_context
 */
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getIdentity } from '../context.js';
import { getAgent } from '../core/registry.js';
import { addToInbox } from '../core/store.js';
import { scheduleWake } from '../core/wake.js';
import type { Message } from '../types.js';

const businessContext = new Map<string, Map<string, string>>();

function getContext(businessId: string): Map<string, string> {
  if (!businessContext.has(businessId)) businessContext.set(businessId, new Map());
  return businessContext.get(businessId)!;
}

export function createStatusTools() {
  return {
    swarm_report_status: {
      description: 'Report your status to your parent.',
      inputSchema: { content: z.string() },
      handler: async (args: { content: string }) => {
        const { agentId, businessId } = getIdentity();
        const from = getAgent(agentId);
        if (!from?.parent) throw new Error('No parent to report to');
        const msg: Message = {
          id: `msg-${uuidv4()}`,
          type: 'message',
          from_agent_id: agentId,
          from_role: from.role,
          to_agent_id: from.parent,
          business_id: businessId,
          content: args.content,
          priority: 'normal',
          timestamp: new Date().toISOString(),
          read: false,
          metadata: { type: 'status_update' },
        };
        addToInbox(from.parent, msg);
        scheduleWake(from.parent);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ delivered: true }) }] };
      },
    },
    swarm_get_business_context: {
      description: 'Get key-value business context (shared across agents).',
      inputSchema: { keys: z.array(z.string()).optional() },
      handler: async (args: { keys?: string[] }) => {
        const { businessId } = getIdentity();
        const ctx = getContext(businessId);
        const keys = args.keys ?? [...ctx.keys()];
        const out: Record<string, string> = {};
        keys.forEach((k) => {
          if (ctx.has(k)) out[k] = ctx.get(k)!;
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(out) }] };
      },
    },
    swarm_update_business_context: {
      description: 'Update key-value business context.',
      inputSchema: { updates: z.record(z.string(), z.string()) },
      handler: async (args: { updates: Record<string, string> }) => {
        const { businessId } = getIdentity();
        const ctx = getContext(businessId);
        Object.entries(args.updates).forEach(([k, v]) => ctx.set(k, v));
        return { content: [{ type: 'text' as const, text: JSON.stringify({ updated: true }) }] };
      },
    },
  };
}
