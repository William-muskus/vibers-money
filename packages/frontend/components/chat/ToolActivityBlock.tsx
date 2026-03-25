'use client';

import { useState } from 'react';
import ActivityLine, { getToolArgs, type ActivityMsg } from '@/components/admin/ActivityLine';

function stringifyDetail(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function fullInputText(msg: ActivityMsg): string {
  if (msg.type !== 'tool_use') return '';
  const args = getToolArgs(msg);
  if (Object.keys(args).length > 0) return stringifyDetail(args);
  if (typeof msg.arguments === 'string' && msg.arguments.trim()) return msg.arguments;
  if (msg.input !== undefined && msg.input !== null) return stringifyDetail(msg.input);
  if (msg.content != null) return stringifyDetail(msg.content);
  return '';
}

function fullOutputText(msg: ActivityMsg): string {
  if (msg.type !== 'tool_result') return '';
  if (msg.output !== undefined && msg.output !== null) return stringifyDetail(msg.output);
  if (msg.content != null) return stringifyDetail(msg.content);
  if (msg.data != null) return stringifyDetail(msg.data);
  return '';
}

export default function ToolActivityBlock({ msg }: { msg: ActivityMsg }) {
  const isTool = msg.type === 'tool_use' || msg.type === 'tool_result';
  const [expanded, setExpanded] = useState(false);

  if (!isTool) {
    return (
      <div className="w-full rounded-xl border border-slate-600/70 bg-slate-900/95 px-3 py-2 shadow-sm dark:border-slate-500/50">
        <ActivityLine msg={msg} />
      </div>
    );
  }

  const inputBody = fullInputText(msg);
  const outputBody = fullOutputText(msg);

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-600/70 bg-slate-900/95 text-left shadow-sm dark:border-slate-500/50">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-800/80"
      >
        <span className="mt-0.5 shrink-0 font-mono text-[11px] text-slate-500" aria-hidden>
          {expanded ? '▼' : '▶'}
        </span>
        <div className="min-w-0 flex-1">
          <ActivityLine msg={msg} />
        </div>
      </button>
      {expanded && (
        <div className="max-h-[min(50vh,420px)] space-y-3 overflow-y-auto border-t border-slate-600/50 px-3 py-2.5 dark:border-slate-500/40">
          {msg.type === 'tool_use' && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Input
              </div>
              <pre className="whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-slate-200/95">
                {inputBody.trim() ? inputBody : '(no input)'}
              </pre>
            </div>
          )}
          {msg.type === 'tool_result' && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Output
              </div>
              <pre className="whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-emerald-100/90">
                {outputBody.trim() ? outputBody : '(no output)'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
