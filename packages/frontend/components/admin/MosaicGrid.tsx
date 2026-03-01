'use client';

import { useState, useEffect } from 'react';
import { getAdminStats, getAdminAgents, adminStreamUrl } from '@/lib/admin-api';
import { subscribeStream, type StreamEvent } from '@/lib/sse';
import AgentTile from './AgentTile';

const prefix = (businessId: string) => `${businessId}--`;

function filterByBusiness(keys: string[], businessId: string | undefined): string[] {
  if (!businessId) return keys;
  const pre = prefix(businessId);
  return keys.filter((k) => k.startsWith(pre));
}

export default function MosaicGrid({ businessId }: { businessId?: string }) {
  const [allAgentKeys, setAllAgentKeys] = useState<string[]>([]);
  const [stats, setStats] = useState({ businessCount: 0, agentCount: 0 });

  const agentKeys = filterByBusiness(allAgentKeys, businessId);

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
      <div className="z-10 flex shrink-0 flex-wrap gap-6 rounded-xl border border-white/5 bg-[#14151c]/80 px-4 py-3 backdrop-blur-xl">
        {businessId ? (
          <>
            <span className="text-xl font-semibold tracking-tight text-white">
              Business: {businessId}
            </span>
            <span className="text-xl font-semibold tracking-tight text-white">
              Agents: {agentKeys.length}
            </span>
          </>
        ) : (
          <>
            <span className="text-xl font-semibold tracking-tight text-white">
              Businesses: {stats.businessCount}
            </span>
            <span className="text-xl font-semibold tracking-tight text-white">
              Agents: {stats.agentCount}
            </span>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {agentKeys.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/50">
            {businessId ? `No agents yet for ${businessId}.` : 'No agents yet. Create a business from the home page.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 pb-2">
            {agentKeys.map((key) => (
              <div key={key} className="min-h-0 max-h-[280px] shrink-0">
                <AgentTile
                  agentKey={key}
                  initialMode="terminal"
                  initialActivities={[]}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
