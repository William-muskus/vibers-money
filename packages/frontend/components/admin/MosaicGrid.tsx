'use client';

import { useState, useEffect } from 'react';
import { getAdminStats, getAdminAgents, adminStreamUrl } from '@/lib/admin-api';
import AgentTile from './AgentTile';

export default function MosaicGrid() {
  const [agentKeys, setAgentKeys] = useState<string[]>([]);
  const [stats, setStats] = useState({
    businessCount: 0,
    agentCount: 0,
    tweetsCount: 0,
    walletBalance: 0,
  });

  useEffect(() => {
    let mounted = true;
    async function fetchAll() {
      try {
        const [agentsData, statsData] = await Promise.all([getAdminAgents(), getAdminStats()]);
        if (!mounted) return;
        setAgentKeys(agentsData.agents || []);
        setStats({
          businessCount: statsData.businessCount ?? 0,
          agentCount: statsData.agentCount ?? 0,
          tweetsCount: (statsData as { tweetsCount?: number }).tweetsCount ?? 0,
          walletBalance: (statsData as { walletBalance?: number }).walletBalance ?? 0,
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
    const es = new EventSource(adminStreamUrl());
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { agent?: string };
        if (data.agent) {
          setAgentKeys((prev) => (prev.includes(data.agent!) ? prev : [...prev, data.agent!]));
        }
      } catch {
        // ignore
      }
    };
    return () => es.close();
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="sticky top-0 z-10 flex flex-wrap gap-6 rounded-lg bg-gray-100 px-4 py-3 dark:bg-gray-800">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">
          Businesses: {stats.businessCount}
        </span>
        <span className="text-2xl font-bold text-gray-900 dark:text-white">
          Agents: {stats.agentCount}
        </span>
        <span className="text-2xl font-bold text-gray-900 dark:text-white">
          Tweets: {stats.tweetsCount}
        </span>
        <span className="text-2xl font-bold text-gray-900 dark:text-white">
          Wallet: ${stats.walletBalance.toFixed(2)}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agentKeys.map((key) => (
          <AgentTile
            key={key}
            agentKey={key}
            initialMode="terminal"
            initialActivities={[]}
          />
        ))}
      </div>
      {agentKeys.length === 0 && (
        <p className="text-center text-sm text-gray-500">No agents yet. Create a business from the home page.</p>
      )}
    </div>
  );
}
