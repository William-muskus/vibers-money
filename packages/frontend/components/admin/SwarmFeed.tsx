'use client';

import { useState, useEffect, useRef } from 'react';
import { subscribeStream } from '@/lib/sse';
import { roleTitleFromSlug } from '@/lib/role-title';

const SWARM_BUS_URL = process.env.NEXT_PUBLIC_SWARM_BUS_URL || 'http://localhost:3100';

type BusEvent =
  | { type: 'message'; business_id: string; from_agent_id: string; from_role: string; to_agent_id: string; content: string; message_type: string }
  | { type: 'agent_registered'; agent_id: string; business_id: string; role: string; role_type: string }
  | { type: 'agent_deregistered'; agent_id: string };

function formatEvent(ev: BusEvent): string {
  if (ev.type === 'message') {
    const fromSlug = ev.from_role || ev.from_agent_id?.split('--')[1] || '?';
    const toSlug = ev.to_agent_id?.split('--')[1] || '?';
    const fromRole = fromSlug === '?' ? '?' : roleTitleFromSlug(fromSlug);
    const toRole = toSlug === '?' ? '?' : roleTitleFromSlug(toSlug);
    return `[${ev.business_id}] ${fromRole} → ${toRole}: "${ev.content.slice(0, 60)}${ev.content.length > 60 ? '…' : ''}"`;
  }
  if (ev.type === 'agent_registered') {
    return `[${ev.business_id}] Agent registered: ${roleTitleFromSlug(ev.role)}`;
  }
  if (ev.type === 'agent_deregistered') {
    return `Agent left: ${ev.agent_id}`;
  }
  return JSON.stringify(ev);
}

function swarmFeedStreamUrl(): string {
  if (typeof window !== 'undefined' && !process.env.NEXT_PUBLIC_SWARM_BUS_URL) {
    return '/api/swarm-bus/events';
  }
  return `${SWARM_BUS_URL}/api/events`;
}

function eventBelongsToBusiness(ev: BusEvent, businessId: string | undefined): boolean {
  if (!businessId) return true;
  if (ev.type === 'message' || ev.type === 'agent_registered') {
    return ev.business_id === businessId;
  }
  if (ev.type === 'agent_deregistered') {
    return ev.agent_id.startsWith(`${businessId}--`);
  }
  return true;
}

export default function SwarmFeed({ businessId }: { businessId?: string }) {
  const [events, setEvents] = useState<BusEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const maxEvents = 200;

  const filteredEvents = businessId
    ? events.filter((ev) => eventBelongsToBusiness(ev, businessId))
    : events;

  useEffect(() => {
    const unsubscribe = subscribeStream(swarmFeedStreamUrl(), (event) => {
      if (event.type === 'info') setConnected(true);
      else setEvents((prev) => [...prev.slice(-(maxEvents - 1)), event as unknown as BusEvent]);
    }, { onDisconnect: () => setConnected(false), onConnectionFailed: () => setConnected(false) });
    return unsubscribe;
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [filteredEvents]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border border-white/5 bg-[#14151c]/80 backdrop-blur-xl">
      <h3 className="border-b border-white/5 px-3 py-2.5 text-sm font-semibold text-white">
        {businessId ? `Swarm Bus — ${businessId}` : 'Swarm Bus Live Feed'}
      </h3>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs text-white/80"
      >
        {filteredEvents.length === 0 && (
          <p className="text-white/50">
            {connected ? (businessId ? `No events yet for ${businessId}.` : 'No events yet.') : 'Connecting to Swarm Bus…'}
          </p>
        )}
        {events.length > 0 && !connected && (
          <p className="sticky top-0 z-10 bg-amber-500/20 py-1 text-amber-300">Reconnecting…</p>
        )}
        {filteredEvents.map((ev, i) => (
          <div key={i} className="border-b border-white/5 py-1.5 last:border-0">
            {formatEvent(ev)}
          </div>
        ))}
      </div>
    </div>
  );
}
