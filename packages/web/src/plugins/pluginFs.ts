import { BaseDirectory, mkdir, readDir, readFile, remove, writeFile } from '@tauri-apps/plugin-fs';
import { isTauriEnv } from '../utils/platform';

const TAURI_REL = 'my-little-todo/plugins';

const IDB_NAME = 'mlt-plugin-fs';
const IDB_STORE = 'blobs';
const IDB_VER = 1;

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAllKeys(): Promise<IDBValidKey[]> {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).getAllKeys();
        req.onsuccess = () => {
          db.close();
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbGet(key: string): Promise<Uint8Array | undefined> {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => {
          db.close();
          resolve(req.result as Uint8Array | undefined);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbPut(key: string, value: Uint8Array): Promise<void> {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbDelete(key: string): Promise<void> {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function makeKey(pluginId: string, relativePath: string): string {
  const norm = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${pluginId}/${norm}`;
}

function normalizeRelativePath(relativePath = ''): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

/** Write a file under the plugin sandbox (Tauri AppData or IndexedDB). */
export async function writePluginFile(
  pluginId: string,
  relativePath: string,
  data: Uint8Array,
): Promise<void> {
  if (isTauriEnv()) {
    const dir = `${TAURI_REL}/${pluginId}`;
    await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
    const filePath = `${dir}/${relativePath.replace(/\\/g, '/')}`;
    const parent = filePath.slice(0, Math.max(filePath.lastIndexOf('/'), 0));
    if (parent.length > dir.length) {
      await mkdir(parent, { baseDir: BaseDirectory.AppData, recursive: true });
    }
    await writeFile(filePath, data, { baseDir: BaseDirectory.AppData });
    return;
  }
  await idbPut(makeKey(pluginId, relativePath), data);
}

export async function readPluginFile(
  pluginId: string,
  relativePath: string,
): Promise<Uint8Array | null> {
  if (isTauriEnv()) {
    const filePath = `${TAURI_REL}/${pluginId}/${relativePath.replace(/\\/g, '/')}`;
    try {
      return await readFile(filePath, { baseDir: BaseDirectory.AppData });
    } catch {
      return null;
    }
  }
  const v = await idbGet(makeKey(pluginId, relativePath));
  return v ?? null;
}

export async function removePluginDirectory(pluginId: string): Promise<void> {
  if (isTauriEnv()) {
    const dir = `${TAURI_REL}/${pluginId}`;
    try {
      await remove(dir, { baseDir: BaseDirectory.AppData, recursive: true });
    } catch {
      /* ignore */
    }
    return;
  }
  const keys = await idbGetAllKeys();
  const prefix = `${pluginId}/`;
  for (const k of keys) {
    if (typeof k === 'string' && k.startsWith(prefix)) {
      await idbDelete(k);
    }
  }
}

export async function listPluginFiles(pluginId: string, relativeDir = ''): Promise<string[]> {
  const normalizedDir = normalizeRelativePath(relativeDir);

  if (isTauriEnv()) {
    const rootPath = normalizedDir
      ? `${TAURI_REL}/${pluginId}/${normalizedDir}`
      : `${TAURI_REL}/${pluginId}`;

    async function walk(dirPath: string, prefix: string): Promise<string[]> {
      let entries:
        | Awaited<ReturnType<typeof readDir>>
        | undefined;
      try {
        entries = await readDir(dirPath, { baseDir: BaseDirectory.AppData });
      } catch {
        return [];
      }

      const files: string[] = [];
      for (const entry of entries) {
        const name = entry.name;
        if (!name) continue;
        const nextPrefix = prefix ? `${prefix}/${name}` : name;
        if (entry.isDirectory) {
          files.push(...(await walk(`${dirPath}/${name}`, nextPrefix)));
          continue;
        }
        files.push(nextPrefix);
      }
      return files;
    }

    return walk(rootPath, normalizedDir);
  }

  const keys = await idbGetAllKeys();
  const basePrefix = normalizedDir ? `${pluginId}/${normalizedDir}/` : `${pluginId}/`;
  const files: string[] = [];

  for (const key of keys) {
    if (typeof key !== 'string' || !key.startsWith(basePrefix)) continue;
    files.push(key.slice(pluginId.length + 1));
  }

  return files.sort((left, right) => left.localeCompare(right));
}

export async function listInstalledPluginIds(): Promise<string[]> {
  if (isTauriEnv()) {
    try {
      const entries = await readDir(TAURI_REL, { baseDir: BaseDirectory.AppData });
      return entries.filter((e) => e.isDirectory).map((e) => e.name);
    } catch {
      return [];
    }
  }
  const keys = await idbGetAllKeys();
  const ids = new Set<string>();
  for (const k of keys) {
    if (typeof k === 'string') {
      const i = k.indexOf('/');
      if (i > 0) ids.add(k.slice(0, i));
    }
  }
  return [...ids];
}
