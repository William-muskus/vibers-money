'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MosaicGrid from '@/components/admin/MosaicGrid';
import SwarmFeed from '@/components/admin/SwarmFeed';
import ChatView from '@/components/chat/ChatView';
import AgentTileMosaic from '@/components/background/AgentTileMosaic';
import { getAdminBusinesses } from '@/lib/admin-api';

export default function AdminPage() {
  const [businessIds, setBusinessIds] = useState<string[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
  const [chatCollapsed, setChatCollapsed] = useState(false);

  useEffect(() => {
    getAdminBusinesses()
      .then((data) => setBusinessIds(data.businessIds || []))
      .catch(() => {});
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <AgentTileMosaic />
      <header className="relative z-10 border-b border-white/5 bg-[#14151c]/80 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm font-medium text-white/70 transition-colors hover:text-white"
          >
            ← Home
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-white">Admin Mosaic</h1>
        </div>
      </header>
      <main className="relative z-10 flex flex-col gap-4 p-4 lg:flex-row lg:p-6">
        <div className="min-w-0 flex-1">
          <MosaicGrid />
          <div className="mt-4 overflow-hidden rounded-xl border border-white/5 bg-[#14151c]/80 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setChatCollapsed((c) => !c)}
              className="flex w-full items-center justify-between border-b border-white/5 px-4 py-3 text-left font-medium text-white"
            >
              Founder Chat
              <span className="text-white/50">{chatCollapsed ? '▼' : '▲'}</span>
            </button>
            {!chatCollapsed && (
              <div className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <label htmlFor="admin-business-select" className="text-sm text-white/70">
                    Business
                  </label>
                  <select
                    id="admin-business-select"
                    value={selectedBusinessId}
                    onChange={(e) => setSelectedBusinessId(e.target.value)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
                  >
                    <option value="">Select business</option>
                    {businessIds.filter((id) => id != null && String(id).trim() !== '').map((id) => (
                      <option key={id} value={id} className="bg-[#14151c] text-white">
                        {id}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedBusinessId ? (
                  <div className="h-[320px] overflow-hidden rounded-lg border border-white/10">
                    <ChatView key={selectedBusinessId} businessId={selectedBusinessId} />
                  </div>
                ) : (
                  <p className="text-sm text-white/50">Select a business to chat with the CEO.</p>
                )}
              </div>
            )}
          </div>
        </div>
        <aside className="h-[320px] w-full shrink-0 lg:h-[calc(100vh-5rem)] lg:w-96 lg:min-w-[24rem]">
          <SwarmFeed />
        </aside>
      </main>
    </div>
  );
}
