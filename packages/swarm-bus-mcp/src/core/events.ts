/**
 * SSE observability: subscribers receive broadcast events (messages, register, deregister, etc.).
 * New subscribers get a replay of recent events so the feed isn't empty after load or reconnect.
 */
import type { Response } from 'express';
import type { Message } from '../types.js';

const subscribers = new Set<Response>();
const RECENT_MAX = 200;
const recentEvents: BusEvent[] = [];

export type BusEvent =
  | { type: 'message'; business_id: string; from_agent_id: string; from_role: string; to_agent_id: string; content: string; message_type: string }
  | { type: 'agent_registered'; agent_id: string; business_id: string; role: string; role_type: string }
  | { type: 'agent_deregistered'; agent_id: string };

export function addEventsSubscriber(res: Response): void {
  for (const ev of recentEvents) {
    try {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    } catch {
      subscribers.delete(res);
      return;
    }
  }
  subscribers.add(res);
  res.on('close', () => subscribers.delete(res));
}

export function broadcastEvent(event: BusEvent): void {
  recentEvents.push(event);
  if (recentEvents.length > RECENT_MAX) recentEvents.shift();

  const data = JSON.stringify(event);
  for (const res of subscribers) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      subscribers.delete(res);
    }
  }
}

export function broadcastMessageAdded(msg: Message): void {
  broadcastEvent({
    type: 'message',
    business_id: msg.business_id,
    from_agent_id: msg.from_agent_id,
    from_role: msg.from_role,
    to_agent_id: msg.to_agent_id,
    content: msg.content.slice(0, 200),
    message_type: msg.type,
  });
}
