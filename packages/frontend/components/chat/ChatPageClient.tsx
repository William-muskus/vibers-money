'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatView from '@/components/chat/ChatView';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import AgentTileMosaic from '@/components/background/AgentTileMosaic';

export default function ChatPageClient({ businessId }: { businessId: string }) {
  const [showQR, setShowQR] = useState(false);
  const [chatUrl, setChatUrl] = useState('');

  useEffect(() => {
    setChatUrl(`${window.location.origin}/chat/${businessId}`);
  }, [businessId]);

  if (!businessId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f8f9fc] p-4 dark:bg-[#0c0d12]">
        <p className="text-gray-600 dark:text-gray-400">Missing business ID.</p>
        <Link href="/" className="text-indigo-600 underline dark:text-indigo-400">
          Go home
        </Link>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-[#0e0e14] dark:bg-[#0c0d12]">
      <AgentTileMosaic />
      <ChatSidebar currentBusinessId={businessId} />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-end gap-2 border-b border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md dark:border-white/5 dark:bg-[#14151c]/80">
          <Link
            href={`/finance/${businessId}`}
            className="rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-all duration-200 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            Finance
          </Link>
          <button
            type="button"
            onClick={() => setShowQR(!showQR)}
            className="rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-all duration-200 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            QR
          </button>
        </header>
        {showQR && chatUrl && (
          <div className="flex shrink-0 justify-center gap-4 border-b border-white/60 bg-white/50 p-4 backdrop-blur-sm dark:border-white/5 dark:bg-[#14151c]/60">
            <QRCodeDisplay url={chatUrl} size={120} />
            <p className="text-xs text-gray-600 dark:text-gray-400">Scan to open this chat on another device</p>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <ChatView businessId={businessId} />
        </div>
      </div>
    </div>
  );
}
