'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getAdminBusinesses } from '@/lib/admin-api';

export default function ChatSidebar({ currentBusinessId = '' }: { currentBusinessId?: string }) {
  const pathname = usePathname();
  const [businessIds, setBusinessIds] = useState<string[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    getAdminBusinesses()
      .then((data) => setBusinessIds(data.businessIds || []))
      .catch(() => setBusinessIds([]));
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed left-0 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-r-xl border border-white/60 bg-white/80 text-gray-600 shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-105 hover:bg-white hover:shadow-xl dark:border-white/10 dark:bg-[#14151c]/90 dark:text-gray-300 dark:hover:bg-[#1a1b2e] sm:hidden"
        aria-label={open ? 'Close sidebar' : 'Open sidebar'}
      >
        {open ? '←' : '☰'}
      </button>
      <aside
        className={`flex h-full w-64 flex-col border-r border-white/60 bg-white/70 backdrop-blur-xl dark:border-white/5 dark:bg-[#14151c]/80 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } fixed left-0 top-0 z-10 transition-transform duration-300 ease-out sm:relative sm:translate-x-0`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="flex flex-col gap-1 p-3 pt-4 sm:pt-3">
          <Link
            href="/"
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
              pathname === '/'
                ? 'bg-indigo-500/15 text-indigo-600 shadow-sm dark:bg-indigo-400/15 dark:text-indigo-400'
                : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'
            }`}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-base font-semibold text-indigo-600 dark:bg-indigo-400/20 dark:text-indigo-400">
              +
            </span>
            New business
          </Link>
          <Link
            href="/admin"
            className="rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 transition-all duration-200 hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            Admin
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto border-t border-gray-200/80 px-2 py-3 dark:border-white/5">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Businesses
          </p>
          {businessIds.length === 0 ? (
            <p className="animate-fade-in px-3 text-sm text-gray-500 dark:text-gray-400">No businesses yet</p>
          ) : (
            <ul className="space-y-0.5">
              {businessIds.map((id, i) => {
                const isActive = pathname === `/chat/${id}` || currentBusinessId === id;
                return (
                  <li
                    key={id}
                    className="animate-fade-in-up opacity-0"
                    style={{ animationDelay: `${i * 0.03}s`, animationFillMode: 'forwards' }}
                  >
                    <Link
                      href={`/chat/${id}`}
                      className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-indigo-500/15 text-indigo-600 shadow-sm dark:bg-indigo-400/15 dark:text-indigo-400'
                          : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'
                      }`}
                    >
                      {id}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
      {open && (
        <div
          className="fixed inset-0 z-9 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300 sm:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
    </>
  );
}
