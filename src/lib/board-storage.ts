// IndexedDB-based board & folder storage system

const DB_NAME = 'tajweedoo_boards';
// v2 adds `recitation_sessions` (see recitation-store.ts); v3 adds
// `recitation_audio`, which holds the spoken corrections a teacher records at
// a verse (see audio-store.ts) — kept in its own store because a blob of tens
// of kilobytes has no business travelling with the small JSON of a session
// every time one is read.
//
// The upgrade is additive only — teachers have saved boards in here and losing
// them is not recoverable — and each step is guarded by its own `contains`
// check so a device arriving from any earlier version lands whole.
const DB_VERSION = 3;

export interface SavedBoard {
  id: string;
  title: string;
  folderId: string | null;
  data: string; // serialized board JSON
  thumbnail?: string; // small PNG data URL
  createdAt: number;
  updatedAt: number;
}

export interface BoardFolder {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
  createdAt: number;
}

const FOLDER_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

export { FOLDER_COLORS };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('boards')) {
        const bs = db.createObjectStore('boards', { keyPath: 'id' });
        bs.createIndex('folderId', 'folderId', { unique: false });
        bs.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('folders')) {
        const fs = db.createObjectStore('folders', { keyPath: 'id' });
        fs.createIndex('parentId', 'parentId', { unique: false });
      }
      if (!db.objectStoreNames.contains('recitation_sessions')) {
        const rs = db.createObjectStore('recitation_sessions', { keyPath: 'id' });
        rs.createIndex('studentName', 'studentName', { unique: false });
        rs.createIndex('startedAt', 'startedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('recitation_audio')) {
        const as = db.createObjectStore('recitation_audio', { keyPath: 'id' });
        // Indexed by session so every clip of a deleted majlis can be found
        // and dropped with it — audio is the one thing here big enough that
        // orphans matter.
        as.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const s = t.objectStore(storeName);
    const r = fn(s);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

function txAll<T>(storeName: string, fn: (store: IDBObjectStore) => IDBRequest<T[]>): Promise<T[]> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, 'readonly');
    const s = t.objectStore(storeName);
    const r = fn(s);
    r.onsuccess = () => resolve(r.result ?? []);
    r.onerror = () => reject(r.error);
  }));
}

// Shared IndexedDB helpers — other stores in this database (recitation
// sessions) reuse them so there is a single connection and upgrade path.
export const idbRequest = tx;
export const idbGetAll = txAll;

// Boards CRUD
export const saveBoard = (board: SavedBoard) => tx('boards', 'readwrite', s => s.put(board));
export const getBoard = (id: string) => tx<SavedBoard>('boards', 'readonly', s => s.get(id));
export const deleteBoard = (id: string) => tx('boards', 'readwrite', s => s.delete(id));
export const getAllBoards = () => txAll<SavedBoard>('boards', s => s.getAll());

// Folders CRUD
export const saveFolder = (folder: BoardFolder) => tx('folders', 'readwrite', s => s.put(folder));
export const getFolder = (id: string) => tx<BoardFolder>('folders', 'readonly', s => s.get(id));
export const deleteFolder = (id: string) => tx('folders', 'readwrite', s => s.delete(id));
export const getAllFolders = () => txAll<BoardFolder>('folders', s => s.getAll());

// Delete folder and all its contents recursively
export async function deleteFolderRecursive(folderId: string): Promise<void> {
  const allFolders = await getAllFolders();
  const allBoards = await getAllBoards();
  
  const childFolderIds = new Set<string>();
  const collectChildren = (parentId: string) => {
    allFolders.filter(f => f.parentId === parentId).forEach(f => {
      childFolderIds.add(f.id);
      collectChildren(f.id);
    });
  };
  collectChildren(folderId);
  childFolderIds.add(folderId);

  // Delete boards in these folders
  for (const b of allBoards) {
    if (b.folderId && childFolderIds.has(b.folderId)) await deleteBoard(b.id);
  }
  // Delete folders
  for (const fid of childFolderIds) await deleteFolder(fid);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
