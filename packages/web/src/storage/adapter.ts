export interface StorageAdapter {
  readFile(...segments: string[]): Promise<string | null>;
  writeFile(content: string, ...segments: string[]): Promise<void>;
  deleteFile(...segments: string[]): Promise<void>;
  listFiles(...segments: string[]): Promise<string[]>;
}

let _adapter: StorageAdapter | null = null;

export function setStorageAdapter(adapter: StorageAdapter): void {
  _adapter = adapter;
}

function getAdapter(): StorageAdapter {
  if (!_adapter) throw new Error('StorageAdapter not initialized. Call setStorageAdapter() first.');
  return _adapter;
}

export async function readFile(...segments: string[]): Promise<string | null> {
  return getAdapter().readFile(...segments);
}

export async function writeFile(content: string, ...segments: string[]): Promise<void> {
  return getAdapter().writeFile(content, ...segments);
}

export async function deleteFile(...segments: string[]): Promise<void> {
  return getAdapter().deleteFile(...segments);
}

export async function listFiles(...segments: string[]): Promise<string[]> {
  return getAdapter().listFiles(...segments);
}
