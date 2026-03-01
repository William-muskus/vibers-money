'use client';

import { useState, useRef, useEffect } from 'react';
import { agentStreamUrl } from '@/lib/admin-api';
import { subscribeStream, type StreamEvent } from '@/lib/sse';
import ActivityLine from './ActivityLine';

type ActivityMsg = Record<string, unknown>;

export default function AgentTile({
  agentKey,
  initialMode,
  initialActivities,
}: {
  agentKey: string;
  initialMode: 'terminal' | 'browser';
  initialActivities: ActivityMsg[];
}) {
  const [mode, setMode] = useState(initialMode);
  const [activities, setActivities] = useState<ActivityMsg[]>(initialActivities);
  const [lastActivityTime, setLastActivityTime] = useState<number>(() => Date.now());
  const [connected, setConnected] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const THINKING_THRESHOLD_MS = 3000;
  const [showThinking, setShowThinking] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeStream(agentStreamUrl(agentKey), (event: StreamEvent) => {
      if (event.type === 'info') setConnected(true);
      if (event.type === 'activity') {
        setLastActivityTime(Date.now());
        if (event.msg) setActivities((prev) => [...prev.slice(-199), event.msg!]);
      }
      if (event.type === 'mode_switch' && event.mode) setMode(event.mode as 'terminal' | 'browser');
      if (event.type === 'screencast_frame') {
        setLastActivityTime(Date.now());
        if (imgRef.current && event.frame) imgRef.current.src = `data:image/jpeg;base64,${event.frame}`;
      }
    }, { onConnectionFailed: () => setConnected(false), onDisconnect: () => setConnected(false) });
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
    <div className="flex h-full max-h-[280px] min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]/95 shadow-xl shadow-black/20 backdrop-blur-xl ring-1 ring-white/5">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="truncate text-sm font-semibold tracking-tight text-white">{roleName}</span>
        <span
          className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium uppercase tracking-wider ${
            mode === 'browser'
              ? 'bg-amber-500/25 text-amber-300 ring-1 ring-amber-400/30'
              : 'bg-white/15 text-white/90 ring-1 ring-white/10'
          }`}
        >
          {mode}
        </span>
      </div>
      <div className="relative flex min-h-[80px] min-w-0 flex-1 flex-col overflow-hidden">
        {!connected && activities.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0c0c12]/95">
            <span className="text-sm text-white/50">Stream unavailable</span>
          </div>
        )}
        {!connected && activities.length > 0 && (
          <div className="sticky top-0 z-10 bg-amber-500/20 py-1.5 text-center text-xs font-medium text-amber-300">
            Reconnecting…
          </div>
        )}
        {showThinking && connected && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-linear-to-b from-[#0c0c12]/95 to-[#14151c]/95">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/80 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/80 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/80 [animation-delay:300ms]" />
            </span>
            <span className="text-sm font-medium text-white/90">Thinking…</span>
          </div>
        )}
        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2.5 text-left"
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
