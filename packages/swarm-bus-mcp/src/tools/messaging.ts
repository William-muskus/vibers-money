/**
 * P0 messaging tools: swarm_check_inbox, swarm_send_message, swarm_broadcast.
 */
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getIdentity } from '../context.js';
import { getAgent, getAgentsByBusiness } from '../core/registry.js';
import { canSendTo, isCEO } from '../core/router.js';
import { addToInbox, getUnread, markRead, findMessageById } from '../core/store.js';
import { scheduleWake } from '../core/wake.js';
import type { Message } from '../types.js';
import { logger } from '../logger.js';

export function createMessagingTools() {
  return {
    swarm_check_inbox: {
      description: 'Check your inbox for pending messages from other agents. Call this at the START of every turn before doing any work. Returns messages; they are marked as read after retrieval.',
      inputSchema: {
        mark_read: z.boolean().optional().describe('Whether to mark returned messages as read. Default: true'),
      },
      handler: async (args: { mark_read?: boolean }) => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'swarm_check_inbox', agentId });
        const mark = args.mark_read !== false;
        const messages = await getUnread(agentId);
        if (mark && messages.length > 0) {
          await markRead(agentId, new Set(messages.map((m) => m.id)));
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ messages }, null, 2) }],
        };
      },
    },

    swarm_send_message: {
      description: 'Send a message to another agent by role name. You can only message your parent (upward) or your direct reports (downward). The target agent must already be spawned and running; if you get "hierarchy or not found", spawn that role first (e.g. via swarm_spawn_agent) before messaging.',
      inputSchema: {
        to: z.string().describe("Role name of the target agent (e.g. 'ceo', 'community-manager')"),
        content: z.string().describe('Message content'),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().describe("Default: 'normal'"),
      },
      handler: async (args: { to: string; content: string; priority?: 'low' | 'normal' | 'high' | 'urgent' }) => {
        const { agentId, businessId } = getIdentity();
        logger.info('tool', { tool: 'swarm_send_message', agentId, to: args.to, contentLength: args.content?.length });
        const from = await getAgent(agentId);
        if (!from) throw new Error('Agent not registered');

        const { allowed, toAgentId } = await canSendTo(agentId, args.to, businessId);
        if (!allowed || !toAgentId) throw new Error(`Cannot send to ${args.to} (hierarchy or not found)`);

        const msg: Message = {
          id: `msg-${uuidv4()}`,
          type: 'message',
          from_agent_id: agentId,
          from_role: from.role,
          to_agent_id: toAgentId,
          business_id: businessId,
          content: args.content,
          priority: args.priority ?? 'normal',
          timestamp: new Date().toISOString(),
          read: false,
        };
        await addToInbox(toAgentId, msg);
        scheduleWake(toAgentId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ delivered: true, message_id: msg.id, to: args.to }) }],
        };
      },
    },

    swarm_broadcast: {
      description: 'Broadcast a message to ALL agents in your business. CEO only. Use for pivots or company-wide announcements.',
      inputSchema: {
        content: z.string().describe('Broadcast message content'),
      },
      handler: async (args: { content: string }) => {
        const { agentId, businessId } = getIdentity();
        logger.info('tool', { tool: 'swarm_broadcast', agentId, contentLength: args.content?.length });
        if (!(await isCEO(agentId))) throw new Error('Only CEO can broadcast');
        const from = await getAgent(agentId);
        if (!from) throw new Error('Agent not registered');

        const targets = (await getAgentsByBusiness(businessId)).filter((a) => a.agent_id !== agentId);
        const msgId = `msg-${uuidv4()}`;
        for (const t of targets) {
          const msg: Message = {
            id: `${msgId}-${t.agent_id}`,
            type: 'broadcast',
            from_agent_id: agentId,
            from_role: from.role,
            to_agent_id: t.agent_id,
            business_id: businessId,
            content: args.content,
            priority: 'normal',
            timestamp: new Date().toISOString(),
            read: false,
          };
          await addToInbox(t.agent_id, msg);
          scheduleWake(t.agent_id);
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ delivered: true, message_id: msgId, count: targets.length }) }],
        };
      },
    },
    swarm_reply: {
      description: 'Reply to a specific message by its message_id. Delivered to the original sender.',
      inputSchema: {
        message_id: z.string(),
        content: z.string(),
      },
      handler: async (args: { message_id: string; content: string }) => {
        const { agentId, businessId } = getIdentity();
        logger.info('tool', { tool: 'swarm_reply', agentId, message_id: args.message_id });
        const orig = await findMessageById(args.message_id);
        if (!orig) throw new Error('Message not found');
        const from = await getAgent(agentId);
        if (!from) throw new Error('Agent not registered');
        const msg: Message = {
          id: `msg-${uuidv4()}`,
          type: 'message',
          from_agent_id: agentId,
          from_role: from.role,
          to_agent_id: orig.from_agent_id,
          business_id: businessId,
          content: args.content,
          priority: 'normal',
          timestamp: new Date().toISOString(),
          read: false,
          metadata: { in_reply_to: args.message_id },
        };
        await addToInbox(orig.from_agent_id, msg);
        scheduleWake(orig.from_agent_id);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ delivered: true }) }] };
      },
    },
  };
}
