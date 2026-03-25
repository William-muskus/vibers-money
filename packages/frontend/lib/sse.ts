import { getOrCreateFounderSessionId } from './session-id';

export type StreamEvent =
  | { type: 'activity'; msg?: { role?: string; content?: string | unknown[]; type?: string; name?: string }; agent?: string }
  | { type: 'mode_switch'; mode?: string; agent?: string }
  | { type: 'info'; message?: string }
  | { type: 'ask_user'; questions?: unknown[]; agent?: string }
  | { type: 'screencast_frame'; frame?: string; agent?: string }
  | { type: 'raw'; data?: string; agent?: string }
  | { type: 'error'; data?: string; agent?: string }
  | { type: 'lifecycle'; stage?: 'agent_spawning' | 'agent_tools_loaded' | 'agent_thinking'; agent?: string };

const MIN_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;

const CONNECTION_FAILED_AFTER_RETRIES = 4;

/** Parse one SSE event block (content between blank lines). Joins multi-line `data:` per HTML spec. */
function dataPayloadFromEventBlock(block: string): string | null {
  const lines = block.split('\n').filter((l) => l.length > 0);
  const dataLines = lines.filter((l) => l.startsWith('data:'));
  if (dataLines.length === 0) return null;
  const joined = dataLines
    .map((l) => {
      const after = l.slice(5);
      return after.startsWith(' ') ? after.slice(1) : after;
    })
    .join('\n');
  if (joined.trim() === '[DONE]') return null;
  return joined;
}

/**
 * Read fetch body as SSE: events are separated by blank lines (\n\n).
 * Chunks may split mid-event; we buffer until a full event is available.
 */
async function streamWithFetch(
  streamUrl: string,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const founderHeader =
    typeof window !== 'undefined' && streamUrl.includes('/api/orchestrator')
      ? (() => {
          const id = getOrCreateFounderSessionId();
          return id ? ({ 'X-Founder-Session-Id': id } as Record<string, string>) : {};
        })()
      : {};
  const res = await fetch(streamUrl, {
    headers: { Accept: 'text/event-stream', ...founderHeader },
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);
  onEvent({ type: 'info', message: 'connected' });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      carry = carry.replace(/\r\n/g, '\n');
      let sep: number;
      while ((sep = carry.indexOf('\n\n')) !== -1) {
        const block = carry.slice(0, sep);
        carry = carry.slice(sep + 2);
        const payload = dataPayloadFromEventBlock(block);
        if (payload == null) continue;
        try {
          const data = JSON.parse(payload) as StreamEvent;
          onEvent(data);
        } catch {
          // ignore non-JSON noise
        }
      }
    }
    // Trailing block without trailing \n\n (some servers)
    if (carry.trim()) {
      const payload = dataPayloadFromEventBlock(carry.replace(/\r\n/g, '\n'));
      if (payload) {
        try {
          onEvent(JSON.parse(payload) as StreamEvent);
        } catch {
          /* ignore */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function subscribeBusinessStream(
  _businessId: string,
  streamUrl: string,
  onEvent: (event: StreamEvent) => void,
  onConnectionFailed?: () => void,
): () => void {
  let cancelled = false;
  let retryCount = 0;
  let hasConnected = false;
  let retryDelay = MIN_RECONNECT_MS;
  let controller: AbortController | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (cancelled) return;
    controller = new AbortController();
    const wrappedOnEvent = (e: StreamEvent) => {
      if (e.type === 'info') hasConnected = true;
      onEvent(e);
    };
    streamWithFetch(streamUrl, wrappedOnEvent, controller.signal)
      .then(() => {
        if (cancelled) return;
        controller = null;
        connect();
      })
      .catch((err) => {
        if (cancelled || err.name === 'AbortError') return;
        controller = null;
        retryCount++;
        if (!hasConnected && retryCount >= CONNECTION_FAILED_AFTER_RETRIES && onConnectionFailed) {
          onConnectionFailed();
          return;
        }
        const delay = retryDelay;
        retryDelay = Math.min(retryDelay * 2, MAX_RECONNECT_MS);
        timeoutId = setTimeout(() => {
          timeoutId = null;
          connect();
        }, delay);
      });
    retryCount = 0;
  }

  connect();
  return () => {
    cancelled = true;
    if (timeoutId) clearTimeout(timeoutId);
    controller?.abort();
  };
}

/**
 * Generic fetch-based SSE subscription with optional retry. Use for orchestrator
 * streams (activity, mode_switch, screencast_frame) through proxy or direct URL.
 */
export function subscribeStream(
  streamUrl: string,
  onEvent: (event: StreamEvent) => void,
  options?: { onConnectionFailed?: () => void; onDisconnect?: () => void },
): () => void {
  let cancelled = false;
  let retryCount = 0;
  let hasConnected = false;
  let retryDelay = MIN_RECONNECT_MS;
  let controller: AbortController | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (cancelled) return;
    controller = new AbortController();
    const wrappedOnEvent = (e: StreamEvent) => {
      if (e.type === 'info') hasConnected = true;
      onEvent(e);
    };
    streamWithFetch(streamUrl, wrappedOnEvent, controller.signal)
      .then(() => {
        if (cancelled) return;
        options?.onDisconnect?.();
        controller = null;
        connect();
      })
      .catch((err) => {
        if (cancelled || err.name === 'AbortError') return;
        options?.onDisconnect?.();
        controller = null;
        retryCount++;
        if (!hasConnected && retryCount >= CONNECTION_FAILED_AFTER_RETRIES && options?.onConnectionFailed) {
          options.onConnectionFailed();
          return;
        }
        const delay = retryDelay;
        retryDelay = Math.min(retryDelay * 2, MAX_RECONNECT_MS);
        timeoutId = setTimeout(() => {
          timeoutId = null;
          connect();
        }, delay);
      });
    retryCount = 0;
  }

  connect();
  return () => {
    cancelled = true;
    if (timeoutId) clearTimeout(timeoutId);
    controller?.abort();
  };
}
