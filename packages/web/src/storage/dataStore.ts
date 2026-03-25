import type { AttachmentConfig, UploadResult } from './blobApi';

export interface LocalChangeRecord {
  table: 'files' | 'settings';
  key: string;
  content: string | null;
  updatedAt: number;
  deletedAt: number | null;
}

/**
 * Unified data store abstraction that merges file storage, settings, and blob
 * management behind a single interface. Platform-specific implementations
 * (ApiDataStore, TauriSqliteDataStore, CapacitorSqliteDataStore) plug in here.
 */
export interface DataStore {
  // ── File CRUD (tasks / stream markdown) ────────────────────────────

  readFile(...segments: string[]): Promise<string | null>;
  writeFile(content: string, ...segments: string[]): Promise<void>;
  deleteFile(...segments: string[]): Promise<void>;
  listFiles(...segments: string[]): Promise<string[]>;

  // ── Key-value settings ─────────────────────────────────────────────

  getSetting(key: string): Promise<string | null>;
  putSetting(key: string, value: string): Promise<void>;
  deleteSetting(key: string): Promise<void>;
  getAllSettings(): Promise<Record<string, string>>;

  // ── Blob / attachment management ───────────────────────────────────

  uploadBlob(file: File): Promise<UploadResult>;
  getBlobUrl(id: string): string;
  deleteBlob(id: string): Promise<void>;
  getAttachmentConfig(): Promise<AttachmentConfig>;

  // ── Sync support (optional, native stores implement this) ─────────

  getChangesSince?(sinceTimestamp: number): Promise<LocalChangeRecord[]>;
}

// ── Global singleton ───────────────────────────────────────────────────

let _store: DataStore | null = null;

export function setDataStore(store: DataStore): void {
  _store = store;
}

export function getDataStore(): DataStore {
  if (!_store) throw new Error('DataStore not initialized. Call setDataStore() first.');
  return _store;
}
