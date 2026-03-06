'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getMyBusinessIds, syncWithServerAndRemoveDeleted } from '@/lib/local-businesses';

export default function ChatSidebar({ currentBusinessId = '' }: { currentBusinessId?: string }) {
  const pathname = usePathname();
  const [businessIds, setBusinessIds] = useState<string[]>([]);
  const [open, setOpen] = useState(true);

  const refreshList = useCallback(() => {
    syncWithServerAndRemoveDeleted().then(() => {
      setBusinessIds(getMyBusinessIds());
    });
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  // Re-sync when user returns to the tab (e.g. after deleting a business folder on server)
  useEffect(() => {
    const onFocus = () => refreshList();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshList]);

  // Periodic re-sync so deleted server folders disappear without switching tabs
  useEffect(() => {
    const interval = setInterval(refreshList, 30_000);
    return () => clearInterval(interval);
  }, [refreshList]);

  return (
    <>
      <div
        className={`relative z-10 flex h-full shrink-0 flex-col overflow-hidden border-r border-white/60 bg-white/70 backdrop-blur-xl transition-[width] duration-300 ease-out dark:border-white/5 dark:bg-[#14151c]/80 ${
          open ? 'w-64' : 'w-12'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <aside className="flex h-full min-w-64 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 flex-col overflow-y-auto border-t border-gray-200/80 px-2 py-3 dark:border-white/5">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <p className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Businesses
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white"
                  aria-label="Retract sidebar"
                >
                  <span className="sr-only">Retract</span>
                  ←
                </button>
              </div>
              <ul className="space-y-0.5">
                <li className="animate-fade-in-up opacity-0" style={{ animationDelay: '0s', animationFillMode: 'forwards' }}>
                  <Link
                    href="/"
                    className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                      pathname === '/'
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'bg-indigo-500/15 text-indigo-600 shadow-sm dark:bg-indigo-400/15 dark:text-indigo-400'
                    }`}
                  >
                    Launch a new business
                  </Link>
                </li>
                {businessIds.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No businesses yet</li>
                ) : (
                  businessIds.filter((id) => id != null && String(id).trim() !== '').map((id, i) => {
                    const sid = String(id).trim();
                    const isActive = pathname === `/chat/${sid}` || currentBusinessId === sid;
                    return (
                      <li
                        key={sid || `business-${i}`}
                        className="animate-fade-in-up opacity-0"
                        style={{ animationDelay: `${(i + 1) * 0.03}s`, animationFillMode: 'forwards' }}
                      >
                        <Link
                          href={`/chat/${encodeURIComponent(sid)}`}
                          className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                            isActive
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'
                          }`}
                        >
                          {sid}
                        </Link>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
            <div className="shrink-0 border-t border-gray-200/80 px-2 py-2 dark:border-white/5">
              <Link
                href="/admin"
                className="block rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 transition-all duration-200 hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                Admin
              </Link>
            </div>
          </div>
        </aside>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="absolute inset-y-0 left-0 z-10 flex w-12 flex-col items-center justify-center border-r border-white/60 bg-white/70 py-4 backdrop-blur-xl text-gray-500 transition-colors hover:bg-white/90 hover:text-gray-700 dark:border-white/5 dark:bg-[#14151c]/80 dark:text-gray-400 dark:hover:bg-[#1a1b2e] dark:hover:text-white"
            aria-label="Show sidebar"
          >
            <span className="origin-center rotate-90 whitespace-nowrap text-xs font-medium tracking-wider">Businesses</span>
          </button>
        )}
      </div>
    </>
  );
}
