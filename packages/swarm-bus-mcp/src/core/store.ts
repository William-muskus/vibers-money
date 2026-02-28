/**
 * In-memory message store: inboxes per agent.
 */
import type { Message } from '../types.js';

const inboxes = new Map<string, Message[]>();

let onMessageAdded: ((agentId: string, message: Message) => void) | null = null;

export function setOnMessageAdded(fn: (agentId: string, message: Message) => void): void {
  onMessageAdded = fn;
}

export function getInbox(agentId: string): Message[] {
  return inboxes.get(agentId) ?? [];
}

export function addToInbox(agentId: string, message: Message): void {
  const list = inboxes.get(agentId) ?? [];
  list.push(message);
  inboxes.set(agentId, list);
  onMessageAdded?.(agentId, message);
}

export function markRead(agentId: string, messageIds: Set<string>): void {
  const list = inboxes.get(agentId);
  if (!list) return;
  for (const m of list) {
    if (messageIds.has(m.id)) m.read = true;
  }
}

export function getUnread(agentId: string): Message[] {
  return (inboxes.get(agentId) ?? []).filter((m) => !m.read);
}

export function clearInbox(agentId: string): void {
  inboxes.delete(agentId);
}

export function findMessageById(messageId: string): Message | null {
  for (const list of inboxes.values()) {
    const m = list.find((msg) => msg.id === messageId);
    if (m) return m;
  }
  return null;
}
