'use client';

import Link from 'next/link';
import { getMyBusinessIds } from '@/lib/local-businesses';
import { useEffect, useState } from 'react';
import ChatSidebar from '@/components/chat/ChatSidebar';

export default function ChatListPage() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    setIds(getMyBusinessIds());
  }, []);

  return (
    <div className="flex h-screen bg-[#0c0c12]">
      <ChatSidebar />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
        <h1 className="text-2xl font-semibold text-white">Chat</h1>
        {ids.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-white/70">Pick a business to chat with your CEO:</p>
            <ul className="flex flex-col gap-2">
              {ids.map((id) => (
                <li key={id}>
                  <Link
                    href={`/chat/${encodeURIComponent(id)}`}
                    className="block rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white hover:bg-white/10"
                  >
                    {id}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-center text-white/70">
            You don’t have any businesses yet. <Link href="/" className="text-indigo-400 underline">Create one from home</Link>.
          </p>
        )}
      </main>
    </div>
  );
}
