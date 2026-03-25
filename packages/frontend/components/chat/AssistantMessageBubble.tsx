'use client';

import { useEffect, useRef, useState } from 'react';
import ChatMarkdown from './ChatMarkdown';

const AUTO_COLLAPSE_MS = 2800;

function formatThoughtDuration(ms: number): string {
  if (ms < 200) return '<1s';
  if (ms < 1000) return `${Math.max(0.1, Math.round(ms / 100) / 10)}s`;
  const s = Math.round(ms / 1000);
  return `${s}s`;
}

type AssistantMessageBubbleProps = {
  content: string;
  reasoning?: string;
  thoughtStartedAt?: number;
  thoughtEndedAt?: number;
};

export default function AssistantMessageBubble({
  content,
  reasoning,
  thoughtStartedAt,
  thoughtEndedAt,
}: AssistantMessageBubbleProps) {
  const hasThought = !!(reasoning && reasoning.trim());
  const hasAnswer = !!(content && content.trim());

  const durationMs =
    hasThought && thoughtStartedAt != null
      ? (thoughtEndedAt ?? (hasAnswer ? Date.now() : undefined))! - thoughtStartedAt
      : null;

  const [expanded, setExpanded] = useState(() => hasThought && !hasAnswer);
  const didAutoCollapse = useRef(false);

  // When this bubble first gets a definitive answer, auto-collapse the thought block (Claude-style)
  useEffect(() => {
    if (hasAnswer && hasThought && !didAutoCollapse.current) {
      didAutoCollapse.current = true;
      const t = setTimeout(() => setExpanded(false), AUTO_COLLAPSE_MS);
      return () => clearTimeout(t);
    }
  }, [hasAnswer, hasThought]);

  const summaryLabel =
    durationMs != null && durationMs >= 0
      ? `Thought for ${formatThoughtDuration(durationMs)}`
      : hasThought
        ? 'Thought'
        : '';

  return (
    <div className="flex w-full justify-end">
      <div className="flex max-w-[85%] flex-col gap-2">
        {hasThought && (
          <div className="overflow-hidden rounded-xl border border-amber-200/60 bg-amber-50/50 text-left dark:border-amber-500/25 dark:bg-amber-950/20">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-amber-900/90 transition-colors hover:bg-amber-100/60 dark:text-amber-100/90 dark:hover:bg-amber-900/30"
            >
              <span className="flex items-center gap-1.5">
                <span className="text-[10px] opacity-70" aria-hidden>
                  {expanded ? '▼' : '▶'}
                </span>
                {summaryLabel || 'Thought'}
              </span>
              {!hasAnswer && (
                <span className="shrink-0 animate-pulse text-[10px] font-normal text-amber-800/70 dark:text-amber-200/60">
                  …
                </span>
              )}
            </button>
            {expanded && (
              <div className="max-h-[min(40vh,320px)] overflow-y-auto border-t border-amber-200/40 px-3 py-2.5 dark:border-amber-500/20">
                <pre className="whitespace-pre-wrap wrap-break-word font-mono text-[13px] leading-relaxed text-amber-950/85 dark:text-amber-100/80">
                  {reasoning?.trim()}
                </pre>
              </div>
            )}
          </div>
        )}

        {hasAnswer && (
          <div className="rounded-2xl rounded-br-md border border-white/60 bg-white/90 px-4 py-2.5 shadow-lg backdrop-blur-sm transition-all duration-300 dark:border-white/10 dark:bg-[#14151c]/90">
            <ChatMarkdown
              content={content}
              variant="assistant"
              className="wrap-break-word text-pretty text-base text-gray-900 dark:text-gray-100"
            />
          </div>
        )}
      </div>
    </div>
  );
}
