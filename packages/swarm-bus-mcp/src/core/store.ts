/**
 * Message store: inboxes per agent. Uses Redis when REDIS_URL is set, otherwise in-memory (local dev).
 */
import type { Message } from '../types.js';
import { getRedis } from './redis.js';

const inboxes = new Map<string, Message[]>();
let onMessageAdded: ((agentId: string, message: Message) => void) | null = null;

const INBOX_PREFIX = 'sb:inbox:';
const MSG_TO_AGENT_PREFIX = 'sb:msg:';
const SEQ_PREFIX = 'sb:seq:';

/** In-memory per-business sequence when Redis is not used. */
const businessSeq = new Map<string, number>();

export function setOnMessageAdded(fn: (agentId: string, message: Message) => void): void {
  onMessageAdded = fn;
}

function notifyMessageAdded(agentId: string, message: Message): void {
  onMessageAdded?.(agentId, message);
}

/** Ensure an inbox exists for the agent (e.g. at registration). No-op for Redis; creates on first add. */
export async function ensureInbox(agentId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) {
    if (!inboxes.has(agentId)) inboxes.set(agentId, []);
  }
}

export async function getInbox(agentId: string): Promise<Message[]> {
  const redis = await getRedis();
  if (redis) {
    const raw = await redis.lrange(`${INBOX_PREFIX}${agentId}`, 0, -1);
    const list = raw.map((s: string) => JSON.parse(s) as Message);
    return list.sort((a: Message, b: Message) => (a.seq ?? 0) - (b.seq ?? 0));
  }
  const list = inboxes.get(agentId) ?? [];
  return [...list].sort((a: Message, b: Message) => (a.seq ?? 0) - (b.seq ?? 0));
}

export async function addToInbox(agentId: string, message: Message): Promise<void> {
  const businessId = message.business_id;
  const redis = await getRedis();
  let seq: number;
  if (redis) {
    seq = await redis.incr(`${SEQ_PREFIX}${businessId}`);
  } else {
    const next = (businessSeq.get(businessId) ?? 0) + 1;
    businessSeq.set(businessId, next);
    seq = next;
  }
  const msgWithSeq = { ...message, seq };
  if (redis) {
    const key = `${INBOX_PREFIX}${agentId}`;
    await redis.rpush(key, JSON.stringify(msgWithSeq));
    await redis.set(`${MSG_TO_AGENT_PREFIX}${message.id}`, agentId);
    notifyMessageAdded(agentId, msgWithSeq);
    return;
  }
  const list = inboxes.get(agentId) ?? [];
  list.push(msgWithSeq);
  inboxes.set(agentId, list);
  notifyMessageAdded(agentId, msgWithSeq);
}

export async function markRead(agentId: string, messageIds: Set<string>): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    const key = `${INBOX_PREFIX}${agentId}`;
    const raw = await redis.lrange(key, 0, -1);
    const updated: string[] = [];
    for (const s of raw) {
      const m = JSON.parse(s) as Message;
      if (messageIds.has(m.id)) m.read = true;
      updated.push(JSON.stringify(m));
    }
    if (updated.length > 0) {
      await redis.del(key);
      await redis.rpush(key, ...updated);
    }
    return;
  }
  const list = inboxes.get(agentId);
  if (!list) return;
  for (const m of list) {
    if (messageIds.has(m.id)) m.read = true;
  }
}

export async function getUnread(agentId: string): Promise<Message[]> {
  const all = await getInbox(agentId); // already sorted by seq
  return all.filter((m) => !m.read);
}

export async function clearInbox(agentId: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    const key = `${INBOX_PREFIX}${agentId}`;
    const raw = await redis.lrange(key, 0, -1);
    for (const s of raw) {
      try {
        const m = JSON.parse(s) as Message;
        await redis.del(`${MSG_TO_AGENT_PREFIX}${m.id}`);
      } catch {
        /* ignore */
      }
    }
    await redis.del(key);
    return;
  }
  inboxes.delete(agentId);
}

export async function findMessageById(messageId: string): Promise<Message | null> {
  const redis = await getRedis();
  if (redis) {
    const agentId = await redis.get(`${MSG_TO_AGENT_PREFIX}${messageId}`);
    if (!agentId) return null;
    const raw = await redis.lrange(`${INBOX_PREFIX}${agentId}`, 0, -1);
    for (const s of raw) {
      const m = JSON.parse(s) as Message;
      if (m.id === messageId) return m;
    }
    return null;
  }
  for (const list of inboxes.values()) {
    const m = list.find((msg) => msg.id === messageId);
    if (m) return m;
  }
  return null;
}
