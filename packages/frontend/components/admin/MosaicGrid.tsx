'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { getAdminStats, getAdminAgents, getBusinessAgentKeys, adminStreamUrl } from '@/lib/admin-api';
import { subscribeStream, type StreamEvent } from '@/lib/sse';
import AgentTile from './AgentTile';
import OrgTreeTile from './OrgTreeTile';

const prefix = (businessId: string) => `${businessId}--`;

const MIN_TILE_PX = 120;
const RESIZE_DEBOUNCE_MS = 80;

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
  const lastStableSizeRef = useRef({ w: 0, h: 0 });

  const agentKeys = filterByBusiness(allAgentKeys, businessId);
  const tileCount = (businessId ? 1 : 0) + agentKeys.length;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 };
      const w = Math.round(Math.max(0, width));
      const h = Math.round(Math.max(0, height));
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        debounceId = null;
        lastStableSizeRef.current = { w, h };
        setGridSize({ w, h });
      }, RESIZE_DEBOUNCE_MS);
    });
    ro.observe(el);
    return () => {
      if (debounceId) clearTimeout(debounceId);
      ro.disconnect();
    };
  }, []);

  const { cols, rows, cellPx } = useMemo(() => {
    const n = tileCount;
    const w = gridSize.w;
    const h = gridSize.h;
    const minCols = 2;
    if (n === 0) return { cols: minCols, rows: 1, cellPx: MIN_TILE_PX };
    if (w <= 0 || h <= 0) {
      const prev = lastStableSizeRef.current;
      if (prev.w > 0 && prev.h > 0) return { cols: minCols, rows: 1, cellPx: MIN_TILE_PX };
      return { cols: minCols, rows: Math.ceil(n / minCols), cellPx: MIN_TILE_PX };
    }
    const maxCols = Math.max(minCols, Math.floor(w / MIN_TILE_PX));
    // Prefer more columns (e.g. 3×2) over fewer (2×3) so the mosaic is squarer and tiles can be square
    for (let c = maxCols; c >= minCols; c--) {
      const r = Math.ceil(n / c);
      const cellPxVal = w / c;
      if (r * cellPxVal <= h) return { cols: c, rows: r, cellPx: cellPxVal };
    }
    const fallbackRows = Math.ceil(n / minCols);
    const fallbackCellPx = Math.min(w / minCols, h / fallbackRows);
    return {
      cols: minCols,
      rows: fallbackRows,
      cellPx: Math.max(1, fallbackCellPx),
    };
  }, [tileCount, gridSize.w, gridSize.h]);

  useEffect(() => {
    let mounted = true;
    async function fetchAll() {
      try {
        if (businessId) {
          const [agentsData, statsData] = await Promise.all([
            getBusinessAgentKeys(businessId),
            getAdminStats(),
          ]);
          if (!mounted) return;
          setAllAgentKeys(agentsData.agents || []);
          setStats({
            businessCount: statsData.businessCount ?? 0,
            agentCount: statsData.agentCount ?? 0,
          });
        } else {
          const [agentsData, statsData] = await Promise.all([getAdminAgents(), getAdminStats()]);
          if (!mounted) return;
          setAllAgentKeys(agentsData.agents || []);
          setStats({
            businessCount: statsData.businessCount ?? 0,
            agentCount: statsData.agentCount ?? 0,
          });
        }
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
  }, [businessId]);

  useEffect(() => {
    const unsubscribe = subscribeStream(adminStreamUrl(), (event: StreamEvent) => {
      if ('agent' in event && event.agent) {
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
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
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
