'use client';

import { useState, useRef, useEffect } from 'react';
import { agentStreamUrl } from '@/lib/admin-api';
import { subscribeStream, type StreamEvent } from '@/lib/sse';
import ActivityLine from './ActivityLine';

type ActivityMsg = Record<string, unknown>;

/** Internal prompts we send to the agent each cycle — don't clutter the mosaic. */
function isInternalPrompt(msg: ActivityMsg): boolean {
  const role = msg.role as string | undefined;
  const raw = msg.content;
  const content =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? (raw as { type?: string; text?: string }[])
            .map((p) => (p?.type === 'text' && typeof p?.text === 'string' ? p.text : ''))
            .join('')
        : '';
  const t = content.trim();
  if (!t) return false;
  if (role === 'system') return true;
  if (role === 'user') {
    if (/The founder sent you a message:\s*"/i.test(t)) return true;
    if (/^Continue\.?\s*$/i.test(t)) return true;
    if (/Read your AGENTS\.md/i.test(t)) return true;
    if (/Check your messages and todos/i.test(t)) return true;
    if (/Check your swarm bus inbox/i.test(t)) return true;
    return true; // hide all other user prompts (orchestrator-injected)
  }
  // Hide assistant messages that are just the prompt echoed back (local model / stub)
  if (role === 'assistant' && /^You are the CEO of this business\.\s*Read your AGENTS\.md/i.test(t)) return true;
  return false;
}

export default function AgentTile({
  agentKey,
  initialMode,
  initialActivities,
  fillContainer,
  mosaic,
}: {
  agentKey: string;
  initialMode: 'terminal' | 'browser';
  initialActivities: ActivityMsg[];
  /** When true, tile fills its grid cell (no max height). Use for mosaic layouts. */
  fillContainer?: boolean;
  /** When true, flush mosaic style: no rounded corners, no shadow, minimal border. */
  mosaic?: boolean;
}) {
  const [mode, setMode] = useState(initialMode);
  const [activities, setActivities] = useState<ActivityMsg[]>(initialActivities);
  const [lastActivityTime, setLastActivityTime] = useState<number>(() => Date.now());
  const [connected, setConnected] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const THINKING_THRESHOLD_MS = 3000;
  const [showThinking, setShowThinking] = useState(false);

  useEffect(() => {
    setConnectionFailed(false);
    const unsubscribe = subscribeStream(agentStreamUrl(agentKey), (event: StreamEvent) => {
      if (event.type === 'info') setConnected(true);
      if (event.type === 'activity') {
        setLastActivityTime(Date.now());
        if (event.msg && !isInternalPrompt(event.msg)) {
          setActivities((prev) => [...prev.slice(-199), event.msg!]);
        }
      }
      if (event.type === 'mode_switch' && event.mode) setMode(event.mode as 'terminal' | 'browser');
      if (event.type === 'screencast_frame') {
        setLastActivityTime(Date.now());
        if (imgRef.current && event.frame) imgRef.current.src = `data:image/jpeg;base64,${event.frame}`;
      }
    }, {
      onConnectionFailed: () => {
        setConnected(false);
        setConnectionFailed(true);
      },
      onDisconnect: () => setConnected(false),
    });
    return unsubscribe;
  }, [agentKey]);

  useEffect(() => {
    const t = setInterval(() => {
      const idle = Date.now() - lastActivityTime > THINKING_THRESHOLD_MS;
      setShowThinking(idle && mode === 'terminal');
    }, 500);
    return () => clearInterval(t);
  }, [lastActivityTime, mode]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [activities]);

  const roleName = agentKey.includes('--') ? agentKey.split('--')[1] : agentKey;

  return (
    <div
      className={`flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#14151c]/95 ${fillContainer ? '' : 'max-h-[280px]'} ${
        mosaic
          ? 'rounded-none border border-white/10 shadow-none ring-0'
          : 'rounded-2xl border border-white/10 shadow-xl shadow-black/20 backdrop-blur-xl ring-1 ring-white/5'
      }`}
    >
      <div
        className={`flex shrink-0 items-center border-b border-white/10 ${mosaic ? 'px-2 py-1.5' : 'px-4 py-2.5'}`}
      >
        <span className="truncate text-sm font-semibold tracking-tight text-white">{roleName}</span>
      </div>
      <div className="relative flex min-h-[80px] min-w-0 flex-1 flex-col overflow-hidden">
        {!connected && activities.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0c0c12]/95">
            <span className="text-sm text-white/50" title={connectionFailed ? 'SSE connection failed after retries. Agent may not be running or orchestrator unreachable.' : undefined}>
              {connectionFailed ? 'Stream unavailable' : 'Connecting…'}
            </span>
          </div>
        )}
        {!connected && activities.length > 0 && (
          <div className="sticky top-0 z-10 bg-amber-500/20 py-1.5 text-center text-xs font-medium text-amber-300">
            Reconnecting…
          </div>
        )}
        {showThinking && connected && (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
            <span className="flex gap-0.5">
              <span className="h-1 w-1 animate-pulse rounded-full bg-white/80 [animation-delay:0ms]" />
              <span className="h-1 w-1 animate-pulse rounded-full bg-white/80 [animation-delay:150ms]" />
              <span className="h-1 w-1 animate-pulse rounded-full bg-white/80 [animation-delay:300ms]" />
            </span>
            Thinking…
          </div>
        )}
        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2.5 text-left"
          style={{ display: mode === 'terminal' ? 'flex' : 'none' }}
        >
          {activities.map((msg, i) => (
            <ActivityLine key={i} msg={msg} />
          ))}
        </div>
        <div className="flex-1 bg-[#0c0c12]" style={{ display: mode === 'browser' ? 'block' : 'none' }}>
          <img ref={imgRef} alt="Live browser" className="h-full w-full object-contain" />
        </div>
      </div>
    </div>
  );
}
