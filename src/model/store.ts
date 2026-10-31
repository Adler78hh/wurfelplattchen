// The gallery: all drawings in this browser. Kept in IndexedDB (much more room than localStorage);
// drawings saved by earlier versions in localStorage are taken over once. Without IndexedDB (some
// private windows) localStorage is used as before.

import { type Doc, normalizeDoc } from './doc';

const DB = 'wuerfelplaettchen';
const STORE = 'docs';
const LS_INDEX = 'wp-index';
const LS_DOC = (id: string) => 'wp-doc-' + id;
const MIGRATED = 'wp-migrated-to-idb';

// ------------------------------------------------------------ localStorage (fallback and old data)

function lsRead<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

const ls = {
  list(): Doc[] {
    return (lsRead<string[]>(LS_INDEX) ?? []).map((id) => lsRead<Doc>(LS_DOC(id))).filter((d): d is Doc => !!d);
  },
  save(d: Doc): boolean {
    try {
      localStorage.setItem(LS_DOC(d.id), JSON.stringify(d));
      const ids = lsRead<string[]>(LS_INDEX) ?? [];
      if (!ids.includes(d.id)) localStorage.setItem(LS_INDEX, JSON.stringify([...ids, d.id]));
      return true;
    } catch {
      return false;
    }
  },
  remove(id: string) {
    try {
      localStorage.removeItem(LS_DOC(id));
      localStorage.setItem(LS_INDEX, JSON.stringify((lsRead<string[]>(LS_INDEX) ?? []).filter((x) => x !== id)));
    } catch {
      /* nothing to do */
    }
  },
};

// ------------------------------------------------------------ IndexedDB

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).then(async (db) => {
    if (!db) return null;
    // Take over drawings from localStorage once.
    try {
      if (!localStorage.getItem(MIGRATED)) {
        const old = ls.list();
        if (old.length) {
          const tx = db.transaction(STORE, 'readwrite');
          for (const d of old) tx.objectStore(STORE).put(d);
          await new Promise<void>((res, rej) => {
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
          });
        }
        localStorage.setItem(MIGRATED, '1');
      }
    } catch {
      /* keep going with what we have */
    }
    return db;
  });
  return dbPromise;
}

async function withStore<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return req(f(db.transaction(STORE, mode).objectStore(STORE)));
}

// ------------------------------------------------------------ public

export async function listDocs(): Promise<Doc[]> {
  const db = await openDb();
  const raw = db ? ((await withStore('readonly', (s) => s.getAll())) as Doc[]) : ls.list();
  return raw
    .map(normalizeDoc)
    .filter((d): d is Doc => !!d)
    .sort((a, b) => b.updated - a.updated);
}

export async function saveDoc(d: Doc): Promise<boolean> {
  try {
    const db = await openDb();
    if (!db) return ls.save(d);
    await withStore('readwrite', (s) => s.put(d));
    return true;
  } catch {
    return ls.save(d);
  }
}

export async function deleteDoc(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return ls.remove(id);
  await withStore('readwrite', (s) => s.delete(id));
  ls.remove(id); // also forget an old copy, so it does not come back
}
