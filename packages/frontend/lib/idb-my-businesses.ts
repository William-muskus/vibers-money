/**
 * IndexedDB persistence for "my business ids" (offline resilience).
 * Store: vibers_local, key: my_business_ids, value: string[].
 */
const DB_NAME = 'vibers_local';
const STORE_NAME = 'vibers_store';
const KEY_MY_BUSINESS_IDS = 'my_business_ids';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function getMyBusinessIdsFromIdb(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(KEY_MY_BUSINESS_IDS);
    req.onsuccess = () => {
      const raw = req.result;
      db.close();
      if (!raw) {
        resolve([]);
        return;
      }
      const arr = Array.isArray(raw) ? raw : [];
      resolve(arr.filter((id: unknown) => typeof id === 'string'));
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function setMyBusinessIdsInIdb(ids: string[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put([...new Set(ids)], KEY_MY_BUSINESS_IDS);
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
