'use client';

import { useState, useEffect } from 'react';
import { getBusinessTree, type TreeEntry } from '@/lib/api';

function TreeRow({ entry, depth }: { entry: TreeEntry; depth: number }) {
  const [open, setOpen] = useState(true);
  const hasChildren = entry.kind === 'dir' && entry.children && entry.children.length > 0;
  const paddingLeft = depth * 12;

  if (entry.kind === 'file') {
    return (
      <div
        className="truncate py-0.5 text-left text-[12px] leading-relaxed text-slate-400"
        style={{ paddingLeft }}
      >
        <span className="text-slate-500">📄</span> {entry.name}
      </div>
    );
  }

  return (
    <div className="py-0.5 text-left text-[12px] leading-relaxed">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-0 items-center gap-1 truncate text-white/90 hover:text-white"
        style={{ paddingLeft }}
      >
        <span className="shrink-0 text-amber-500/90">{open ? '▾' : '▸'}</span>
        <span className="text-amber-400/95">📁</span> {entry.name}
      </button>
      {open && hasChildren && (
        <div className="mt-0.5">
          {entry.children!.map((child, i) => (
            <TreeRow key={`${child.name}-${i}`} entry={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgTreeTile({ businessId }: { businessId: string }) {
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    getBusinessTree(businessId)
      .then(setTree)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [businessId]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-none border border-white/10 bg-[#14151c]/95 shadow-none ring-0">
      <div className="flex shrink-0 items-center border-b border-white/10 px-2 py-1.5">
        <span className="truncate text-sm font-semibold tracking-tight text-white">Org directory</span>
      </div>
      <div className="min-h-[80px] min-w-0 flex-1 overflow-y-auto px-3 py-2">
        {loading && (
          <p className="text-xs text-white/50">Loading…</p>
        )}
        {error && (
          <p className="text-xs text-amber-400/90" title={error}>{error}</p>
        )}
        {!loading && !error && tree.length === 0 && (
          <p className="text-xs text-white/50">Empty or not found.</p>
        )}
        {!loading && !error && tree.length > 0 && (
          <div className="space-y-0.5">
            {tree.map((entry, i) => (
              <TreeRow key={`${entry.name}-${i}`} entry={entry} depth={0} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
