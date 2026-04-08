import type { StreamEntry, Task } from '@my-little-todo/core';
import type { AttachmentConfig, UploadResult } from './blobApi';

/** Tables that participate in sync replication. */
export type SyncTable = 'tasks' | 'stream_entries' | 'settings' | 'blobs';

/**
 * Incremental change record for local sync (native stores).
 * `version` matches the row's assigned monotonic version from `version_seq`.
 */
export interface LocalChangeRecord {
  table: SyncTable;
  key: string;
  /** JSON-serialized row payload; null when soft-deleted. */
  data: string | null;
  version: number;
  updatedAt: number;
  deletedAt: number | null;
}

/**
 * Unified data store: relational tasks/stream + KV settings + blobs.
 * Implementations: Tauri/Capacitor SQLite, HTTP API client.
 */
export interface DataStore {
  // ── Tasks ────────────────────────────────────────────────────────

  getAllTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  putTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;

  // ── Stream ───────────────────────────────────────────────────────

  getStreamDay(dateKey: string): Promise<StreamEntry[]>;
  /** Recent entries across days, sorted newest first (default 14 days). */
  getRecentStream(days?: number): Promise<StreamEntry[]>;
  /** Distinct calendar day keys (YYYY-MM-DD), newest first. */
  listStreamDateKeys(): Promise<string[]>;
  /** Case-insensitive substring search over stream entry bodies. */
  searchStreamEntries(query: string, limit?: number): Promise<StreamEntry[]>;
  putStreamEntry(entry: StreamEntry): Promise<void>;
  deleteStreamEntry(id: string): Promise<void>;

  // ── Settings (KV) ──────────────────────────────────────────────

  getSetting(key: string): Promise<string | null>;
  putSetting(key: string, value: string): Promise<void>;
  deleteSetting(key: string): Promise<void>;
  getAllSettings(): Promise<Record<string, string>>;

  // ── Blobs ───────────────────────────────────────────────────────

  uploadBlob(file: File): Promise<UploadResult>;
  getBlobUrl(id: string): string;
  deleteBlob(id: string): Promise<void>;
  getAttachmentConfig(): Promise<AttachmentConfig>;

  // ── Sync (optional: native SQLite stores) ──────────────────────

  /** All rows with version > sinceVersion across synced tables. */
  getChangesSince?(sinceVersion: number): Promise<LocalChangeRecord[]>;
  getMaxVersion?(): Promise<number>;
}

let _store: DataStore | null = null;

function pluginSettingKey(pluginId: string, key: string): string {
  return `plugin:${pluginId}:${key}`;
}

/** Attach default plugin KV helpers when store omits them. */
export function withPluginDataDefaults(store: DataStore): DataStore {
  if (store.getPluginData && store.putPluginData && store.deletePluginData) return store;
  return {
    ...store,
    getPluginData: async (pluginId, key) => store.getSetting(pluginSettingKey(pluginId, key)),
    putPluginData: async (pluginId, key, value) =>
      store.putSetting(pluginSettingKey(pluginId, key), value),
    deletePluginData: async (pluginId, key) =>
      store.deleteSetting(pluginSettingKey(pluginId, key)),
  };
}

export function setDataStore(store: DataStore): void {
  _store = withPluginDataDefaults(store);
}

export function getDataStore(): DataStore {
  if (!_store) throw new Error('DataStore not initialized. Call setDataStore() first.');
  return _store;
}
