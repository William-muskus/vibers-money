'use client';

import { useState } from 'react';
import Link from 'next/link';
import SwarmGraph from '@/components/graph/SwarmGraph';

export default function GraphPage() {
  const [businessId, setBusinessId] = useState('');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            ← Home
          </Link>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Swarm Graph</h1>
        </div>
        <input
          type="text"
          value={businessId}
          onChange={(e) => setBusinessId(e.target.value)}
          placeholder="Business ID (optional)"
          className="mt-2 w-full rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </header>
      <main className="p-4">
        <SwarmGraph businessId={businessId.trim() || undefined} />
      </main>
    </div>
  );
}
