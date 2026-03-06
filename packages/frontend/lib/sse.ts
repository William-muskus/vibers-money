export type StreamEvent =
  | { type: 'activity'; msg?: { role?: string; content?: string | unknown[]; type?: string; name?: string }; agent?: string }
  | { type: 'mode_switch'; mode?: string; agent?: string }
  | { type: 'info'; message?: string }
  | { type: 'ask_user'; questions?: unknown[] }
  | { type: 'screencast_frame'; frame?: string; agent?: string }
  | { type: 'raw'; data?: string; agent?: string }
  | { type: 'error'; data?: string; agent?: string }
  | { type: 'lifecycle'; stage?: 'agent_spawning' | 'agent_tools_loaded' | 'agent_thinking'; agent?: string };

const MIN_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;

const CONNECTION_FAILED_AFTER_RETRIES = 4;

/** Parse SSE stream via fetch — more reliable than EventSource through Next.js proxy. */
async function streamWithFetch(
  streamUrl: string,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(streamUrl, {
    headers: { Accept: 'text/event-stream' },
    cache: 'no-store',
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);
  onEvent({ type: 'info', message: 'connected' });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6)) as StreamEvent;
            onEvent(data);
          } catch {
            // ignore parse errors
          }
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
 * Returns cleanup; call it on unmount to abort and stop reconnecting.
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
