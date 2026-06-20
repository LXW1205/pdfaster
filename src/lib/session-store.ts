// ponytail: raw indexedDB API. No `idb` / `dexie` dep. 80 lines is
// acceptable for a single object store; swap to `idb` if a second
// store lands (e.g. recent-files list, per-document annotations).
//
// The schema is one object store keyed by `sessionId` with an index
// on `updatedAt` for the "latest" query. Only ONE record is ever
// live at a time — the editor overwrites it on every save. The
// `latest()` query returns the most recently updated record (which
// is always "the one"). The `clear()` deletes the latest.
//
// Threat model: a shared computer. The store holds annotations +
// form values for the last document the user opened in the editor.
// Auto-save is the default. The user MUST click "Close" in the
// editor toolbar to drop the record. We do NOT hook
// `beforeunload` to clear (it's not reliable across browsers) —
// if the user just navigates away, the record stays. They can
// come back and restore. The threat model is documented in the
// user-visible "Close" affordance; the auto-restore is never
// silent (see EditorPage's prompt).
import type { Annotation } from '../annotations/types';
import type { FormFieldState } from '../state/form';

const DB_NAME = 'pdfaster-sessions';
const DB_VERSION = 1;
const STORE = 'sessions';
const UPDATED_AT_INDEX = 'updatedAt';

export type SessionRecord = {
  sessionId: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  annotations: Annotation[];
  formFields: FormFieldState[];
  createdAt: number;
  updatedAt: number;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'sessionId' });
        store.createIndex(UPDATED_AT_INDEX, 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction, db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('aborted')); };
  });
}

export const SessionStore = {
  async save(rec: SessionRecord): Promise<void> {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    return txDone(tx, db);
  },
  async latest(): Promise<SessionRecord | null> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index(UPDATED_AT_INDEX).openCursor(null, 'prev');
      req.onsuccess = () => {
        const cursor = req.result;
        resolve(cursor ? (cursor.value as SessionRecord) : null);
        db.close();
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  },
  // ponytail: recent files for the landing page. We don't store the
  // PDF binary (see the threat model in the file header), so the
  // "click recent → re-drop" flow is the privacy-preserving compromise.
  // Sort by updatedAt desc, cap at `limit` (default 5 — the spec's
  // "recent" cap).
  async list(limit = 5): Promise<SessionRecord[]> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const out: SessionRecord[] = [];
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index(UPDATED_AT_INDEX).openCursor(null, 'prev');
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && out.length < limit) {
          out.push(cursor.value as SessionRecord);
          cursor.continue();
        } else {
          db.close();
          resolve(out);
        }
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  },
  async clear(): Promise<void> {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.index(UPDATED_AT_INDEX).openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) cursor.delete();
    };
    return txDone(tx, db);
  },
};
