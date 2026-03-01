'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { getAdminStats, getAdminAgents, adminStreamUrl } from '@/lib/admin-api';
import { subscribeStream, type StreamEvent } from '@/lib/sse';
import AgentTile from './AgentTile';
import OrgTreeTile from './OrgTreeTile';

const prefix = (businessId: string) => `${businessId}--`;

const MIN_TILE_PX = 120;

function filterByBusiness(keys: string[], businessId: string | undefined): string[] {
  if (!businessId) return keys;
  const pre = prefix(businessId);
  return keys.filter((k) => k.startsWith(pre));
}

export default function MosaicGrid({ businessId }: { businessId?: string }) {
  const [allAgentKeys, setAllAgentKeys] = useState<string[]>([]);
  const [stats, setStats] = useState({ businessCount: 0, agentCount: 0 });
  const [gridSize, setGridSize] = useState({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const agentKeys = filterByBusiness(allAgentKeys, businessId);
  const tileCount = (businessId ? 1 : 0) + agentKeys.length;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 };
      setGridSize({ w: Math.max(0, width), h: Math.max(0, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { cols, rows, cellPx } = useMemo(() => {
    const n = tileCount;
    const w = gridSize.w;
    const h = gridSize.h;
    const minCols = 2;
    if (n === 0 || w <= 0 || h <= 0)
      return { cols: minCols, rows: 1, cellPx: MIN_TILE_PX };
    const maxCols = Math.max(minCols, Math.floor(w / MIN_TILE_PX));
    // Prefer fewer columns (more rows, bigger square tiles). Use smallest c that fits in height
    // so we get 2+ rows when there's room instead of one long row.
    for (let c = minCols; c <= maxCols; c++) {
      const r = Math.ceil(n / c);
      const cellPxVal = w / c;
      if (r * cellPxVal <= h) return { cols: c, rows: r, cellPx: cellPxVal };
    }
    return { cols: minCols, rows: n, cellPx: Math.min(w / minCols, h / n) };
  }, [tileCount, gridSize.w, gridSize.h]);

  useEffect(() => {
    let mounted = true;
    async function fetchAll() {
      try {
        const [agentsData, statsData] = await Promise.all([getAdminAgents(), getAdminStats()]);
        if (!mounted) return;
        setAllAgentKeys(agentsData.agents || []);
        setStats({
          businessCount: statsData.businessCount ?? 0,
          agentCount: statsData.agentCount ?? 0,
        });
      } catch {
        // ignore
      }
    }
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeStream(adminStreamUrl(), (event: StreamEvent) => {
      if (event.agent) {
        if (businessId && !event.agent.startsWith(prefix(businessId))) return;
        setAllAgentKeys((prev) => (prev.includes(event.agent!) ? prev : [...prev, event.agent!]));
      }
    });
    return unsubscribe;
  }, [businessId]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="z-10 flex shrink-0 flex-col gap-0.5 py-2">
        {businessId ? (
          <>
            <span className="text-xl font-semibold tracking-tight text-white">
              {businessId}
            </span>
            <span className="text-sm text-white/70">
              Agents: {agentKeys.length}
            </span>
          </>
        ) : (
          <>
            <span className="text-xl font-semibold tracking-tight text-white">
              Businesses: {stats.businessCount}
            </span>
            <span className="text-sm text-white/70">
              Agents: {stats.agentCount}
            </span>
          </>
        )}
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden">
        {tileCount === 0 ? (
          <p className="py-6 text-center text-sm text-white/50">
            {businessId ? `No agents yet for ${businessId}.` : 'No agents yet. Create a business from the home page.'}
          </p>
        ) : (
          <div
            className="grid w-full min-w-0 max-w-full"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, ${cellPx}px)`,
            }}
          >
            {businessId && (
              <div
                className="flex min-h-0 min-w-0 overflow-hidden"
                style={{ height: cellPx }}
              >
                <OrgTreeTile businessId={businessId} />
              </div>
            )}
            {agentKeys.map((key) => (
              <div
                key={key}
                className="flex min-h-0 min-w-0 overflow-hidden"
                style={{ height: cellPx }}
              >
                <AgentTile
                  agentKey={key}
                  initialMode="terminal"
                  initialActivities={[]}
                  fillContainer
                  mosaic
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
