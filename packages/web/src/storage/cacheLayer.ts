const DB_NAME = 'mlt-cache';
const DB_VERSION = 1;
const STORE_TASKS = 'tasks';
const STORE_STREAM = 'stream';
const STORE_META = 'meta';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TASKS)) {
        db.createObjectStore(STORE_TASKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_STREAM)) {
        db.createObjectStore(STORE_STREAM, { keyPath: 'dateKey' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function txGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function txPut(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function txClear(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Tasks cache ---

export async function getCachedTasks(): Promise<unknown[] | null> {
  try {
    const db = await openDB();
    const meta = await txGet<{ key: string; value: string }>(db, STORE_META, 'tasks-timestamp');
    if (!meta) return null;
    const age = Date.now() - Number(meta.value);
    if (age > 24 * 60 * 60 * 1000) return null; // stale after 24h
    const tasks = await txGetAll(db, STORE_TASKS);
    return tasks.length > 0 ? tasks : null;
  } catch {
    return null;
  }
}

export async function setCachedTasks(tasks: unknown[]): Promise<void> {
  try {
    const db = await openDB();
    await txClear(db, STORE_TASKS);
    for (const task of tasks) {
      await txPut(db, STORE_TASKS, task);
    }
    await txPut(db, STORE_META, { key: 'tasks-timestamp', value: String(Date.now()) });
  } catch {
    // cache write failure is non-critical
  }
}

// --- Stream cache ---

interface StreamDayCache {
  dateKey: string;
  entries: unknown[];
}

export async function getCachedStreamDays(): Promise<StreamDayCache[] | null> {
  try {
    const db = await openDB();
    const meta = await txGet<{ key: string; value: string }>(db, STORE_META, 'stream-timestamp');
    if (!meta) return null;
    const age = Date.now() - Number(meta.value);
    if (age > 24 * 60 * 60 * 1000) return null;
    const days = await txGetAll<StreamDayCache>(db, STORE_STREAM);
    return days.length > 0 ? days : null;
  } catch {
    return null;
  }
}

export async function setCachedStreamEntries(
  entries: unknown[],
  dateKeyFn: (e: unknown) => string,
): Promise<void> {
  try {
    const db = await openDB();
    await txClear(db, STORE_STREAM);
    const byDay = new Map<string, unknown[]>();
    for (const entry of entries) {
      const dk = dateKeyFn(entry);
      const arr = byDay.get(dk) ?? [];
      arr.push(entry);
      byDay.set(dk, arr);
    }
    for (const [dateKey, dayEntries] of byDay) {
      await txPut(db, STORE_STREAM, { dateKey, entries: dayEntries });
    }
    await txPut(db, STORE_META, { key: 'stream-timestamp', value: String(Date.now()) });
  } catch {
    // non-critical
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await openDB();
    await txClear(db, STORE_TASKS);
    await txClear(db, STORE_STREAM);
    await txClear(db, STORE_META);
  } catch {
    // non-critical
  }
}
