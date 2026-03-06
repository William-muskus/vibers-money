import { describe, it, expect, beforeEach } from 'vitest';
import {
  getInbox,
  addToInbox,
  markRead,
  getUnread,
  clearInbox,
  findMessageById,
} from '../src/core/store.js';
import type { Message } from '../src/types.js';

function msg(id: string, to: string, read = false): Message {
  return {
    id,
    type: 'message',
    from_agent_id: 'a--ceo',
    from_role: 'ceo',
    to_agent_id: to,
    business_id: 'biz',
    content: 'hi',
    priority: 'normal',
    timestamp: new Date().toISOString(),
    read,
  };
}

describe('swarm-bus store', () => {
  beforeEach(async () => {
    await clearInbox('agent-1');
    await clearInbox('agent-2');
  });

  it('getInbox returns empty for unknown agent', async () => {
    expect(await getInbox('agent-1')).toEqual([]);
  });

  it('addToInbox and getInbox', async () => {
    await addToInbox('agent-1', msg('m1', 'agent-1'));
    await addToInbox('agent-1', msg('m2', 'agent-1'));
    expect(await getInbox('agent-1')).toHaveLength(2);
  });

  it('getUnread and markRead', async () => {
    await addToInbox('agent-1', msg('m1', 'agent-1', false));
    await addToInbox('agent-1', msg('m2', 'agent-1', false));
    await markRead('agent-1', new Set(['m1']));
    expect(await getUnread('agent-1')).toHaveLength(1);
    expect((await getInbox('agent-1'))[0].read).toBe(true);
  });

  it('findMessageById finds across inboxes', async () => {
    await addToInbox('agent-1', msg('m1', 'agent-1'));
    await addToInbox('agent-2', msg('m2', 'agent-2'));
    expect(await findMessageById('m2')).toMatchObject({ id: 'm2', to_agent_id: 'agent-2' });
    expect(await findMessageById('m3')).toBeNull();
  });

  it('clearInbox removes all messages for agent', async () => {
    await addToInbox('agent-1', msg('m1', 'agent-1'));
    await clearInbox('agent-1');
    expect(await getInbox('agent-1')).toEqual([]);
    expect(await findMessageById('m1')).toBeNull();
  });
});
