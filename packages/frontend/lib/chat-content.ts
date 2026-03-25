/**
 * Normalize Vibe / OpenAI-style message content for the founder chat and mosaic.
 * Thinking models often emit empty `content` with text in `reasoning_content` until the final reply.
 */

/** Vibe can send string | array | { text } — normalize to plain text. */
export function textFromMsgContent(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    const parts: string[] = [];
    for (const p of raw) {
      if (typeof p === 'string') parts.push(p);
      else if (p && typeof p === 'object') {
        const o = p as { type?: string; text?: string; content?: unknown };
        if (typeof o.text === 'string') parts.push(o.text);
        else if (typeof o.content === 'string') parts.push(o.content);
      }
    }
    return parts.join('');
  }
  if (typeof raw === 'object') {
    const o = raw as { text?: string; content?: unknown };
    if (typeof o.text === 'string') return o.text;
    if (typeof o.content === 'string') return o.content;
  }
  return String(raw);
}

export type AssistantMsgFields = {
  content?: unknown;
  reasoning_content?: unknown;
  reasoning?: unknown;
  thinking?: unknown;
};

function firstNonEmptyText(...raws: unknown[]): string {
  for (const r of raws) {
    const t = textFromMsgContent(r);
    if (t.trim()) return t;
  }
  return '';
}

/**
 * Prefer public assistant `content`; if empty (tool step / streaming), show reasoning fields
 * so the UI isn’t blank while the model thinks or calls tools (e.g. mosaic tiles).
 */
export function textFromAssistantPayload(msg: AssistantMsgFields): string {
  const main = textFromMsgContent(msg.content);
  if (main.trim()) return main;
  return firstNonEmptyText(msg.reasoning_content, msg.reasoning, msg.thinking);
}

/** Split streams for chat UI: answer vs internal reasoning (thinking models). */
export function extractAssistantParts(msg: Record<string, unknown>): { answer: string; reasoning: string } {
  const m = msg as AssistantMsgFields & { delta?: unknown; content_delta?: unknown };
  const delta = textFromMsgContent(m.delta ?? m.content_delta);
  const content = textFromMsgContent(m.content);
  /** Prefer full `content` when present (cumulative snapshots); else token `delta`. */
  const answer = content !== '' ? content : delta;
  return {
    answer,
    reasoning: firstNonEmptyText(m.reasoning_content, m.reasoning, m.thinking),
  };
}

/**
 * Merge a new NDJSON chunk into accumulated assistant text.
 * Supports cumulative snapshots (each chunk extends or replaces prefix) and token deltas (append).
 */
export function mergeStreamText(prev: string, incoming: string): string {
  if (!incoming) return prev;
  if (!prev) return incoming;
  if (incoming === prev) return prev;
  if (incoming.startsWith(prev)) return incoming;
  if (prev.startsWith(incoming)) return prev;
  return prev + incoming;
}
