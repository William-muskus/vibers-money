'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MosaicGrid from '@/components/admin/MosaicGrid';
import SwarmFeed from '@/components/admin/SwarmFeed';
import ChatView from '@/components/chat/ChatView';
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            ← Home
          </Link>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Admin Mosaic</h1>
        </div>
      </header>
      <main className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          <MosaicGrid />
          <div className="mt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setChatCollapsed((c) => !c)}
              className="flex w-full items-center justify-between px-4 py-3 text-left font-medium text-gray-900 dark:text-white"
            >
              Founder Chat
              <span className="text-gray-500">{chatCollapsed ? '▼' : '▲'}</span>
            </button>
            {!chatCollapsed && (
              <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-2 flex items-center gap-2">
                  <label htmlFor="admin-business-select" className="text-sm text-gray-600 dark:text-gray-400">
                    Business
                  </label>
                  <select
                    id="admin-business-select"
                    value={selectedBusinessId}
                    onChange={(e) => setSelectedBusinessId(e.target.value)}
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">Select business</option>
                    {businessIds.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedBusinessId ? (
                  <div className="h-[320px] overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600">
                    <ChatView businessId={selectedBusinessId} />
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Select a business to chat with the CEO.</p>
                )}
              </div>
            )}
          </div>
        </div>
        <aside className="h-[320px] w-full lg:h-[calc(100vh-4rem)] lg:w-96 lg:min-w-[24rem]">
          <SwarmFeed />
        </aside>
      </main>
    </div>
  );
}
