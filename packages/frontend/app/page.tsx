'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { createBusiness } from '@/lib/api';
import { addMyBusinessId } from '@/lib/local-businesses';
import ChatSidebar from '@/components/chat/ChatSidebar';
import Composer from '@/components/chat/Composer';
import AgentTileMosaic from '@/components/background/AgentTileMosaic';

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);
    setError('');
    try {
      const { businessId } = await createBusiness(text, text);
      addMyBusinessId(businessId);
      const params = new URLSearchParams();
      params.set('initialMessage', text);
      router.push(`/chat/${businessId}?${params.toString()}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c0c12]">
        <p className="text-white/70">Loading…</p>
      </div>
    );
  }

  // Seamless flow: launcher for everyone (no login required). Account is created/linked when user funds via Stripe.
  return (
    <div className="relative flex h-screen w-full overflow-hidden">
      <AgentTileMosaic />
      <ChatSidebar />
      <main className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-full flex-col items-center justify-center px-4 pb-32 pt-6">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
            <h1 className="animate-fade-in-up text-3xl font-bold tracking-tight text-white sm:text-4xl delay-1 drop-shadow-sm">
              What business are we launching today?
            </h1>
            <p className="animate-fade-in-up text-base text-white/80 delay-2 sm:text-lg">
              Got an idea? Just vibe it.
            </p>
            {error && (
              <p className="animate-fade-in text-sm text-red-300 delay-2">
                {error}
              </p>
            )}
            <div className="w-full animate-fade-in-up delay-3">
              <Composer
                value={input}
                onChange={setInput}
                onSend={handleSend}
                disabled={loading}
                variant="hero"
                placeholder="I want to launch a dog meme newsletter and tiktok channel..."
                className="mx-auto"
              />
            </div>
            {status !== 'authenticated' && (
              <p className="animate-fade-in-up text-sm text-white/60 delay-3">
                <Link href="/login" className="underline hover:text-white/80">Sign in</Link> to save your businesses across devices. No account needed until you fund via Stripe.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
