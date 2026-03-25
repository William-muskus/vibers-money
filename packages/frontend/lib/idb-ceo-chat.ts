/**
 * IndexedDB persistence for CEO chat messages (full thread: user + assistant).
 * Store: vibers_local, key: ceo_chat_${businessId}, value: ChatMessage[].
 * Keeps all user messages and CEO replies; no cap so history is preserved.
 */
const DB_NAME = 'vibers_local';
const STORE_NAME = 'vibers_store';

export type ChatMessage =
  | {
      kind: 'text';
      /** Stable React list key (survives reorder); not from the model. */
      clientKey?: string;
      id?: string;
      role: 'user' | 'assistant';
      content: string;
      /** Model reasoning / chain-of-thought (shown in collapsible “Thought” block). */
      reasoning?: string;
      /** First reasoning chunk time (ms) for “Thought for Xs”. */
      thoughtStartedAt?: number;
      /** First non-empty answer token time (ms). */
      thoughtEndedAt?: number;
    }
  | {
      kind: 'activity';
      clientKey?: string;
      id?: string;
      /** tool_use / tool_result snapshot from orchestrator SSE (JSON-serializable). */
      msg: Record<string, unknown>;
    }
  | { kind: 'ask_user'; id?: string; questions: AskUserQuestion[] };

export interface AskUserQuestion {
  question: string;
  header?: string;
  options?: { label: string; description?: string }[];
  multi_select?: boolean;
}

function key(businessId: string): string {
  return `ceo_chat_${businessId}`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
  });
}

function isValidMessage(m: unknown): m is ChatMessage {
  if (!m || typeof m !== 'object' || !('kind' in m)) return false;
  const k = (m as { kind: string }).kind;
  if (k === 'text') {
    const r = (m as { role?: string }).role;
    return r === 'user' || r === 'assistant';
  }
  if (k === 'activity') {
    const doc = m as { msg?: unknown };
    return doc.msg != null && typeof doc.msg === 'object' && !Array.isArray(doc.msg);
  }
  if (k === 'ask_user') return Array.isArray((m as { questions?: unknown }).questions);
  return false;
}

const LEGACY_LOCALSTORAGE_KEY = 'ceo-chat-messages';

function getLegacyFromLocalStorage(businessId: string): ChatMessage[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${LEGACY_LOCALSTORAGE_KEY}-${businessId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const arr = parsed.filter(isValidMessage);
    return arr.length > 0 ? arr : null;
  } catch {
    return null;
  }
}

export async function getCeoChatMessagesFromIdb(businessId: string): Promise<ChatMessage[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key(businessId));
    req.onsuccess = async () => {
      const raw = req.result;
      db.close();
      if (raw && Array.isArray(raw)) {
        const arr = raw.filter(isValidMessage);
        if (arr.length > 0) {
          resolve(arr);
          return;
        }
      }
      // One-time migration from localStorage
      const legacy = getLegacyFromLocalStorage(businessId);
      if (legacy) {
        await setCeoChatMessagesInIdb(businessId, legacy);
        try {
          localStorage.removeItem(`${LEGACY_LOCALSTORAGE_KEY}-${businessId}`);
        } catch {
          /* ignore */
        }
        resolve(legacy);
      } else {
        resolve([]);
      }
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function setCeoChatMessagesInIdb(
  businessId: string,
  messages: ChatMessage[],
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(messages, key(businessId));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function deleteCeoChatMessagesFromIdb(businessId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(key(businessId));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
