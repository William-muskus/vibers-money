'use client';

import { useState } from 'react';
import Link from 'next/link';
import ChatView from '@/components/chat/ChatView';
import QRCodeDisplay from '@/components/QRCodeDisplay';

export default function ChatPageClient({ businessId }: { businessId: string }) {
  const [showQR, setShowQR] = useState(false);
  const chatUrl = typeof window !== 'undefined' ? `${window.location.origin}/chat/${businessId}` : '';

  if (!businessId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <p className="text-gray-600 dark:text-gray-400">Missing business ID.</p>
        <Link href="/" className="text-blue-600 underline">
          Go home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <Link href="/" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          ←
        </Link>
        <h1 className="flex-1 text-lg font-semibold text-gray-900 dark:text-white">
          {businessId}
        </h1>
        <Link
          href={`/finance/${businessId}`}
          className="rounded bg-gray-200 px-2 py-1 text-sm dark:bg-gray-700"
        >
          Finance
        </Link>
        <button
          type="button"
          onClick={() => setShowQR(!showQR)}
          className="rounded bg-gray-200 px-2 py-1 text-sm dark:bg-gray-700"
        >
          QR
        </button>
      </header>
      {showQR && chatUrl && (
        <div className="flex justify-center gap-4 border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <QRCodeDisplay url={chatUrl} size={120} />
          <p className="text-xs text-gray-600 dark:text-gray-400">Scan to open this chat on another device</p>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <ChatView businessId={businessId} />
      </div>
    </div>
  );
}
