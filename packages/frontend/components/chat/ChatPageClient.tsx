'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatView from '@/components/chat/ChatView';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import AgentTileMosaic from '@/components/background/AgentTileMosaic';
import MosaicGrid from '@/components/admin/MosaicGrid';
import SwarmFeed from '@/components/admin/SwarmFeed';
import { getAdminAgents } from '@/lib/admin-api';
import { getBusinessStatus, normalizeBusinessId, pauseBusiness, resumeBusiness } from '@/lib/api';
import { canAccessBusiness, canAccessBusinessAsync, getMyBusinessIds } from '@/lib/local-businesses';

const MOSAIC_WIDTH_KEY = 'chat-mosaic-width';
const MIN_MOSAIC_PX = 280;
const MAX_MOSAIC_PX = 720;
const DEFAULT_MOSAIC_PX = 420;

const SWARM_HEIGHT_KEY = 'chat-swarm-height';
const MIN_SWARM_PX = 120;
const MAX_SWARM_PX = 560;
const DEFAULT_SWARM_PX = 280;

function getStoredMosaicWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_MOSAIC_PX;
  const stored = localStorage.getItem(MOSAIC_WIDTH_KEY);
  if (stored == null) return DEFAULT_MOSAIC_PX;
  const n = parseInt(stored, 10);
  return Number.isFinite(n) ? Math.min(MAX_MOSAIC_PX, Math.max(MIN_MOSAIC_PX, n)) : DEFAULT_MOSAIC_PX;
}

function getStoredSwarmHeight(): number {
  if (typeof window === 'undefined') return DEFAULT_SWARM_PX;
  const stored = localStorage.getItem(SWARM_HEIGHT_KEY);
  if (stored == null) return DEFAULT_SWARM_PX;
  const n = parseInt(stored, 10);
  return Number.isFinite(n) ? Math.min(MAX_SWARM_PX, Math.max(MIN_SWARM_PX, n)) : DEFAULT_SWARM_PX;
}

export default function ChatPageClient({
  businessId,
  initialMessage,
}: {
  businessId: string;
  initialMessage?: string;
}) {
  const router = useRouter();
  const [showQR, setShowQR] = useState(false);
  const [showMosaic, setShowMosaic] = useState(false);
  const [mosaicWidth, setMosaicWidth] = useState(DEFAULT_MOSAIC_PX);
  const [swarmHeight, setSwarmHeight] = useState(DEFAULT_SWARM_PX);
  const [chatUrl, setChatUrl] = useState('');
  const [myBusinessCount, setMyBusinessCount] = useState(0);
  const [agentsInThisBusiness, setAgentsInThisBusiness] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const resizeStartRef = useRef<{ x: number; w: number } | null>(null);
  const swarmResizeStartRef = useRef<{ y: number; h: number } | null>(null);

  useEffect(() => {
    setMosaicWidth(getStoredMosaicWidth());
    setSwarmHeight(getStoredSwarmHeight());
  }, []);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeStartRef.current) return;
    const { x: startX, w: startW } = resizeStartRef.current;
    const next = Math.min(MAX_MOSAIC_PX, Math.max(MIN_MOSAIC_PX, startW + startX - e.clientX));
    setMosaicWidth(next);
    if (typeof window !== 'undefined') localStorage.setItem(MOSAIC_WIDTH_KEY, String(next));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizeStartRef.current = null;
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);

  const handleSwarmResizeMove = useCallback((e: MouseEvent) => {
    if (!swarmResizeStartRef.current) return;
    const { y: startY, h: startH } = swarmResizeStartRef.current;
    const next = Math.min(MAX_SWARM_PX, Math.max(MIN_SWARM_PX, startH + startY - e.clientY));
    setSwarmHeight(next);
    if (typeof window !== 'undefined') localStorage.setItem(SWARM_HEIGHT_KEY, String(next));
  }, []);

  const handleSwarmResizeEnd = useCallback(() => {
    swarmResizeStartRef.current = null;
    window.removeEventListener('mousemove', handleSwarmResizeMove);
    window.removeEventListener('mouseup', handleSwarmResizeEnd);
  }, [handleSwarmResizeMove]);

  const startSwarmResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      swarmResizeStartRef.current = { y: e.clientY, h: swarmHeight };
      window.addEventListener('mousemove', handleSwarmResizeMove);
      window.addEventListener('mouseup', handleSwarmResizeEnd);
    },
    [swarmHeight, handleSwarmResizeMove, handleSwarmResizeEnd]
  );

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeStartRef.current = { x: e.clientX, w: mosaicWidth };
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
    },
    [mosaicWidth, handleResizeMove, handleResizeEnd]
  );

  useEffect(() => {
    setChatUrl(`${window.location.origin}/chat/${businessId}`);
  }, [businessId]);

  useEffect(() => {
    if (!businessId) {
      setAllowed(false);
      return;
    }
    if (canAccessBusiness(businessId)) {
      setAllowed(true);
      return;
    }
    let cancelled = false;
    canAccessBusinessAsync(businessId).then((ok) => {
      if (!cancelled) setAllowed(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    getBusinessStatus(businessId).then((s) => setPaused(s.paused)).catch(() => setPaused(false));
  }, [businessId]);

  useEffect(() => {
    if (initialMessage && typeof window !== 'undefined' && window.location.search.includes('initialMessage=')) {
      router.replace(`/chat/${businessId}`, { scroll: false });
    }
  }, [businessId, initialMessage, router]);

  useEffect(() => {
    function fetchCounts() {
      setMyBusinessCount(getMyBusinessIds().length);
      getAdminAgents()
        .then(({ agents }) => {
          const id = normalizeBusinessId(businessId);
          const prefix = id + '--';
          setAgentsInThisBusiness(agents.filter((key) => key.startsWith(prefix)).length);
        })
        .catch(() => {});
    }
    if (!businessId) return;
    fetchCounts();
    const interval = setInterval(fetchCounts, 10000);
    return () => clearInterval(interval);
  }, [businessId]);

  async function togglePause() {
    if (!businessId || pauseLoading) return;
    setPauseLoading(true);
    try {
      if (paused) {
        await resumeBusiness(businessId);
        setPaused(false);
      } else {
        await pauseBusiness(businessId);
        setPaused(true);
      }
    } catch {
      // keep current state
    } finally {
      setPauseLoading(false);
    }
  }

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

  if (allowed === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f8f9fc] p-4 dark:bg-[#0c0d12]">
        <p className="text-gray-600 dark:text-gray-400">You don’t have access to this business.</p>
        <Link href="/" className="text-indigo-600 underline dark:text-indigo-400">
          Go home
        </Link>
      </div>
    );
  }

  if (allowed === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f8f9fc] p-4 dark:bg-[#0c0d12]">
        <p className="text-gray-500 dark:text-gray-500">Checking access…</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-full overflow-hidden">
      <AgentTileMosaic />
      <ChatSidebar currentBusinessId={businessId} />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md dark:border-white/5 dark:bg-[#14151c]/80">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {myBusinessCount === 1 ? 'Business' : 'Businesses'}: {myBusinessCount}
            <span className="mx-2 text-gray-400 dark:text-gray-500" aria-hidden>|</span>
            {agentsInThisBusiness === 1 ? 'Agent' : 'Agents'}: {agentsInThisBusiness}
          </span>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePause}
            disabled={pauseLoading}
            className="rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-all duration-200 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
            title={paused ? 'Resume agents' : 'Pause agents'}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <Link
            href={`/finance/${businessId}`}
            className="rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-all duration-200 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            Finance
          </Link>
          <button
            type="button"
            onClick={() => setShowMosaic(!showMosaic)}
            className="rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-all duration-200 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            {showMosaic ? 'Hide mosaic' : 'Mosaic'}
          </button>
          <button
            type="button"
            onClick={() => setShowQR(!showQR)}
            className="rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-all duration-200 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            QR
          </button>
          </div>
        </header>
        {showQR && chatUrl && (
          <div className="flex shrink-0 justify-center gap-4 border-b border-white/60 bg-white/50 p-4 backdrop-blur-sm dark:border-white/5 dark:bg-[#14151c]/60">
            <QRCodeDisplay url={chatUrl} size={120} />
            <p className="text-xs text-gray-600 dark:text-gray-400">Scan to open this chat on another device</p>
          </div>
        )}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1">
            <ChatView businessId={businessId} initialMessage={initialMessage} />
          </div>
          {showMosaic && (
            <>
              <div className="flex shrink-0 cursor-col-resize justify-center" style={{ width: 12 }}>
                <div
                  role="separator"
                  aria-label="Resize mosaic panel"
                  onMouseDown={startResize}
                  className="w-1 flex-shrink-0 select-none bg-transparent"
                />
              </div>
              <aside
                className="flex shrink-0 flex-col overflow-hidden border-white/10"
                style={{ width: mosaicWidth, minWidth: mosaicWidth }}
              >
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <MosaicGrid businessId={businessId} />
                </div>
                <div
                  role="separator"
                  aria-label="Resize mosaic and swarm height"
                  onMouseDown={startSwarmResize}
                  className="h-4 shrink-0 cursor-row-resize select-none bg-transparent"
                />
                <div
                  className="min-h-0 shrink-0 overflow-hidden"
                  style={{ height: swarmHeight }}
                >
                  <SwarmFeed businessId={businessId} />
                </div>
              </aside>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
