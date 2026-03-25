/**
 * "My businesses" list stored locally until account creation (anonymous session).
 * PRD: anonymous session → chat → fund via Stripe when ready → backend links session.
 * Persisted in both localStorage and IndexedDB for offline resilience.
 */
import { getMyBusinessIdsFromIdb, setMyBusinessIdsInIdb } from './idb-my-businesses';
import { deleteCeoChatMessagesFromIdb } from './idb-ceo-chat';

const STORAGE_KEY = 'vibers_my_business_ids';

let cache: string[] | null = null;
let idbSyncStarted = false;

function readLocalStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeLocalStorage(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // ignore
  }
}

function triggerIdbSync(): void {
  if (idbSyncStarted || typeof window === 'undefined') return;
  idbSyncStarted = true;
  getMyBusinessIdsFromIdb()
    .then((idbIds) => {
      const current = cache ?? [];
      const merged = [...new Set([...current, ...idbIds])];
      if (merged.length !== current.length || merged.some((id, i) => id !== current[i])) {
        cache = merged;
        writeLocalStorage(merged);
        setMyBusinessIdsInIdb(merged).catch(() => {});
      }
    })
    .catch(() => {});
}

function read(): string[] {
  if (typeof window === 'undefined') return [];
  if (cache !== null) return cache;
  cache = readLocalStorage();
  triggerIdbSync();
  return cache;
}

function write(ids: string[]): void {
  if (typeof window === 'undefined') return;
  const next = [...new Set(ids)];
  cache = next;
  writeLocalStorage(next);
  setMyBusinessIdsInIdb(next).catch(() => {});
}

export function getMyBusinessIds(): string[] {
  return read().filter((id) => typeof id === 'string' && id.trim() !== '');
}

export function addMyBusinessId(businessId: string): void {
  const ids = read();
  if (ids.includes(businessId)) return;
  write([...ids, businessId]);
}

export function removeMyBusinessId(businessId: string): void {
  write(read().filter((id) => id !== businessId));
}

/**
 * Fetch business IDs from the orchestrator (disk on server) and **replace** the local list with that
 * result — server is the source of truth. Removes stale local-only entries and picks up new businesses.
 * Clears CEO chat IndexedDB for businesses that disappeared on disk.
 * @returns The server list on success, or `null` if the request failed (cache unchanged).
 */
export async function syncWithServerAndRemoveDeleted(): Promise<string[] | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { getAdminBusinesses } = await import('./admin-api');
    const { businessIds: validIds } = await getAdminBusinesses();
    const next = [...new Set((validIds ?? []).filter((id) => typeof id === 'string' && id.trim() !== ''))];
    const cached = read();
    const removed = cached.filter((id) => !next.includes(id));
    write(next);
    await setMyBusinessIdsInIdb(next).catch(() => {});
    for (const id of removed) {
      deleteCeoChatMessagesFromIdb(id).catch(() => {});
    }
    return next;
  } catch {
    // offline or orchestrator down — leave cache as-is
    return null;
  }
}

/**
 * Whether the current user is allowed to access this business's chat (sync: local list only).
 */
export function canAccessBusiness(businessId: string): boolean {
  if (!businessId) return false;
  return getMyBusinessIds().includes(businessId);
}

/**
 * Async check: local list or backend can-access. If backend allows, adds business to local list.
 */
export async function canAccessBusinessAsync(businessId: string): Promise<boolean> {
  if (!businessId) return false;
  if (getMyBusinessIds().includes(businessId)) return true;
  const { canAccessBusinessFromBackend } = await import('./api');
  const allowed = await canAccessBusinessFromBackend(businessId);
  if (allowed) addMyBusinessId(businessId);
  return allowed;
}
