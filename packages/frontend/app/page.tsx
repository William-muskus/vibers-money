'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBusiness } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { businessId } = await createBusiness(name.trim(), prompt.trim() || name.trim());
      router.push(`/chat/${businessId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-slate-50 to-slate-100 p-6 dark:from-slate-900 dark:to-slate-800">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
          vibers.money
        </h1>
        <p className="max-w-sm text-slate-600 dark:text-slate-400">
          AI agent swarm for your business. Just vibe it.
        </p>
      </div>
      <form
        onSubmit={handleCreate}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-800/80 dark:shadow-slate-900/50"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Business name (e.g. Vintage Stickers)"
          className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-500/20 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white dark:placeholder-slate-500 dark:focus:border-violet-400 dark:focus:bg-slate-700"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What's your business idea? (optional)"
          rows={3}
          className="resize-none rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-500/20 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white dark:placeholder-slate-500 dark:focus:border-violet-400 dark:focus:bg-slate-700"
        />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white shadow-md shadow-violet-600/25 transition hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-500 dark:shadow-violet-500/25 dark:hover:bg-violet-600"
        >
          {loading ? 'Creating...' : 'Start business'}
        </button>
      </form>
    </main>
  );
}
