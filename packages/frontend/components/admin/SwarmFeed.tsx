'use client';

import { useState, useEffect, useRef } from 'react';

const SWARM_BUS_URL = process.env.NEXT_PUBLIC_SWARM_BUS_URL || 'http://localhost:3100';

type BusEvent =
  | { type: 'message'; business_id: string; from_agent_id: string; from_role: string; to_agent_id: string; content: string; message_type: string }
  | { type: 'agent_registered'; agent_id: string; business_id: string; role: string; role_type: string }
  | { type: 'agent_deregistered'; agent_id: string };

function formatEvent(ev: BusEvent): string {
  if (ev.type === 'message') {
    const fromRole = ev.from_role || ev.from_agent_id?.split('--')[1] || '?';
    const toRole = ev.to_agent_id?.split('--')[1] || '?';
    return `[${ev.business_id}] ${fromRole} → ${toRole}: "${ev.content.slice(0, 60)}${ev.content.length > 60 ? '…' : ''}"`;
  }
  if (ev.type === 'agent_registered') {
    return `[${ev.business_id}] Agent registered: ${ev.role}`;
  }
  if (ev.type === 'agent_deregistered') {
    return `Agent left: ${ev.agent_id}`;
  }
  return JSON.stringify(ev);
}

export default function SwarmFeed() {
  const [events, setEvents] = useState<BusEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const maxEvents = 100;

  useEffect(() => {
    const url = `${SWARM_BUS_URL}/api/events`;
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as BusEvent;
        setEvents((prev) => [...prev.slice(-(maxEvents - 1)), data]);
      } catch {
        // ignore
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [events]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-white">
        Swarm Bus Live Feed
      </h3>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs text-gray-700 dark:text-gray-300"
      >
        {events.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400">Connecting to Swarm Bus…</p>
        )}
        {events.map((ev, i) => (
          <div key={i} className="border-b border-gray-100 py-1 dark:border-gray-700">
            {formatEvent(ev)}
          </div>
        ))}
      </div>
    </div>
  );
}
