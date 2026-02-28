import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getIdentity } from '../context.js';
import { addToInbox } from '../core/store.js';
import { scheduleWake } from '../core/wake.js';
import type { Message } from '../types.js';

const events = new Map<string, { target_agent_id: string; business_id: string; message: string; timer: ReturnType<typeof setInterval> }>();

export function createSchedulingTools() {
  return {
    swarm_schedule_event: {
      description: 'Schedule a recurring event.',
      inputSchema: {
        target_role: z.string(),
        event_name: z.string(),
        message: z.string(),
        interval_seconds: z.number(),
      },
      handler: async (args: { target_role: string; event_name: string; message: string; interval_seconds: number }) => {
        const { businessId } = getIdentity();
        const targetId = `${businessId}--${args.target_role}`;
        const id = `evt-${uuidv4()}`;
        const timer = setInterval(() => {
          const msg: Message = {
            id: `msg-${uuidv4()}`,
            type: 'scheduled_event',
            from_agent_id: 'system',
            from_role: 'system',
            to_agent_id: targetId,
            business_id: businessId,
            content: args.message,
            priority: 'normal',
            timestamp: new Date().toISOString(),
            read: false,
          };
          addToInbox(targetId, msg);
          scheduleWake(targetId);
        }, args.interval_seconds * 1000);
        events.set(id, { target_agent_id: targetId, business_id: businessId, message: args.message, timer });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ event_id: id }) }] };
      },
    },
    swarm_cancel_event: {
      description: 'Cancel a scheduled event.',
      inputSchema: { event_id: z.string() },
      handler: async (args: { event_id: string }) => {
        const e = events.get(args.event_id);
        if (e?.timer) clearInterval(e.timer);
        events.delete(args.event_id);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ cancelled: true }) }] };
      },
    },
    swarm_list_events: {
      description: 'List scheduled events.',
      inputSchema: {},
      handler: async () => {
        const { businessId } = getIdentity();
        const list = [...events.entries()].filter(([, v]) => v.business_id === businessId).map(([id]) => id);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ events: list }) }] };
      },
    },
  };
}
