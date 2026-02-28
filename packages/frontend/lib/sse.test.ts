import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { subscribeBusinessStream } from './sse';

describe('subscribeBusinessStream', () => {
  let instance: { onmessage?: (e: { data: string }) => void; onerror?: () => void; close: () => void };

  beforeEach(() => {
    instance = { close: vi.fn() };
    vi.stubGlobal('EventSource', vi.fn(() => instance));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls onEvent when message received', () => {
    const onEvent = vi.fn();
    subscribeBusinessStream('biz', 'http://localhost/stream', onEvent);
    expect(instance.onmessage).toBeDefined();
    instance.onmessage!({ data: JSON.stringify({ type: 'activity', msg: { content: 'hi' } }) });
    expect(onEvent).toHaveBeenCalledWith({ type: 'activity', msg: { content: 'hi' } });
  });

  it('unsubscribe closes EventSource', () => {
    const unsub = subscribeBusinessStream('biz', 'http://localhost/stream', () => {});
    unsub();
    expect(instance.close).toHaveBeenCalled();
  });
});
