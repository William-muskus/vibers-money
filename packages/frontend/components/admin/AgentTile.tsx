'use client';

import { useState, useRef, useEffect } from 'react';
import { agentStreamUrl } from '@/lib/admin-api';
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
  const [lastActivityTime, setLastActivityTime] = useState<number>(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const THINKING_THRESHOLD_MS = 3000;
  const [showThinking, setShowThinking] = useState(false);

  useEffect(() => {
    setLastActivityTime(Date.now());
  }, []);

  useEffect(() => {
    const es = new EventSource(agentStreamUrl(agentKey));
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type: string; mode?: string; msg?: ActivityMsg; frame?: string };
        switch (data.type) {
          case 'activity':
            setLastActivityTime(Date.now());
            if (data.msg) setActivities((prev) => [...prev.slice(-199), data.msg!]);
            break;
          case 'mode_switch':
            if (data.mode) setMode(data.mode as 'terminal' | 'browser');
            break;
          case 'screencast_frame':
            setLastActivityTime(Date.now());
            if (imgRef.current && data.frame) imgRef.current.src = `data:image/jpeg;base64,${data.frame}`;
            break;
        }
      } catch {
        // ignore
      }
    };
    return () => es.close();
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
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b border-gray-200 px-2 py-1 dark:border-gray-700">
        <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{roleName}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            mode === 'browser' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
          }`}
        >
          {mode}
        </span>
      </div>
      <div className="relative flex min-h-[120px] flex-1 flex-col overflow-hidden">
        {showThinking && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/70 dark:bg-gray-950/70">
            <span className="animate-pulse text-sm font-medium text-white">Thinking…</span>
          </div>
        )}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-2 text-left"
          style={{ display: mode === 'terminal' ? 'block' : 'none' }}
        >
          {activities.map((msg, i) => (
            <ActivityLine key={i} msg={msg} />
          ))}
        </div>
        <div className="flex-1 bg-gray-900" style={{ display: mode === 'browser' ? 'block' : 'none' }}>
          <img ref={imgRef} alt="Live browser" className="h-full w-full object-contain" />
        </div>
      </div>
    </div>
  );
}
