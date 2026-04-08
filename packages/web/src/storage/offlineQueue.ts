/**
 * Legacy IndexedDB queue for the old virtual-file `/api/files` API.
 * Relational DataStore uses direct SQLite/API calls; a future offline write queue would
 * enqueue `putTask` / `putStreamEntry` operations instead of `writeFile`/`deleteFile`.
 */
const DB_NAME = 'mlt-offline';
const DB_VERSION = 1;
const STORE_QUEUE = 'queue';

export interface QueuedOperation {
  id: string;
  timestamp: number;
  type: 'writeFile' | 'deleteFile';
  args: string[];
  content?: string;
  retries: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const store = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueOperation(
  op: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries'>,
): Promise<string> {
  const db = await openDB();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: QueuedOperation = {
    ...op,
    id,
    timestamp: Date.now(),
    retries: 0,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).put(entry);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedOperations(): Promise<QueuedOperation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const index = tx.objectStore(STORE_QUEUE).index('timestamp');
    const req = index.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateRetryCount(id: string, retries: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORE_QUEUE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      if (getReq.result) {
        store.put({ ...getReq.result, retries });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueueSize(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const req = tx.objectStore(STORE_QUEUE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const MAX_RETRIES = 5;
let _syncing = false;
let _listeners: Array<(size: number) => void> = [];

export function onQueueChange(listener: (size: number) => void): () => void {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}

function notifyListeners(size: number) {
  for (const l of _listeners) l(size);
}

export async function replayQueue(executor: {
  writeFile: (content: string, ...segments: string[]) => Promise<void>;
  deleteFile: (...segments: string[]) => Promise<void>;
}): Promise<{ succeeded: number; failed: number }> {
  if (_syncing) return { succeeded: 0, failed: 0 };
  _syncing = true;
  let succeeded = 0;
  let failed = 0;

  try {
    const ops = await getQueuedOperations();
    for (const op of ops) {
      try {
        if (op.type === 'writeFile' && op.content != null) {
          await executor.writeFile(op.content, ...op.args);
        } else if (op.type === 'deleteFile') {
          await executor.deleteFile(...op.args);
        }
        await removeFromQueue(op.id);
        succeeded++;
      } catch {
        if (op.retries >= MAX_RETRIES) {
          await removeFromQueue(op.id);
          failed++;
        } else {
          await updateRetryCount(op.id, op.retries + 1);
          failed++;
        }
      }
    }
    const remaining = await getQueueSize();
    notifyListeners(remaining);
  } finally {
    _syncing = false;
  }

  return { succeeded, failed };
}

export function startAutoSync(
  executor: {
    writeFile: (content: string, ...segments: string[]) => Promise<void>;
    deleteFile: (...segments: string[]) => Promise<void>;
  },
  intervalMs = 30000,
): () => void {
  const handler = () => {
    if (navigator.onLine) {
      replayQueue(executor);
    }
  };

  window.addEventListener('online', handler);
  const timer = setInterval(handler, intervalMs);

  handler();

  return () => {
    window.removeEventListener('online', handler);
    clearInterval(timer);
  };
}

/** Legacy IndexedDB queue from the old virtual-file API; drain without re-uploading. */
export function createDirectExecutor(_baseUrl: string) {
  return {
    async writeFile(_content: string, ..._segments: string[]): Promise<void> {
      console.warn(
        '[offlineQueue] Discarding legacy queued writeFile (data layer is relational now).',
      );
    },
    async deleteFile(..._segments: string[]): Promise<void> {
      console.warn('[offlineQueue] Discarding legacy queued deleteFile.');
    },
  };
}
