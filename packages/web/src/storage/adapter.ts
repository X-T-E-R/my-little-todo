import { getDataStore } from './dataStore';

/**
 * Legacy StorageAdapter interface — kept for type compatibility.
 * All methods now proxy through the global DataStore.
 */
export interface StorageAdapter {
  readFile(...segments: string[]): Promise<string | null>;
  writeFile(content: string, ...segments: string[]): Promise<void>;
  deleteFile(...segments: string[]): Promise<void>;
  listFiles(...segments: string[]): Promise<string[]>;
}

/**
 * @deprecated Use `setDataStore()` from `dataStore.ts` instead.
 * This is a no-op kept for backward compatibility during migration.
 */
export function setStorageAdapter(_adapter: StorageAdapter): void {
  // no-op: storage is now managed via DataStore
}

export async function readFile(...segments: string[]): Promise<string | null> {
  return getDataStore().readFile(...segments);
}

export async function writeFile(content: string, ...segments: string[]): Promise<void> {
  return getDataStore().writeFile(content, ...segments);
}

export async function deleteFile(...segments: string[]): Promise<void> {
  return getDataStore().deleteFile(...segments);
}

export async function listFiles(...segments: string[]): Promise<string[]> {
  return getDataStore().listFiles(...segments);
}
