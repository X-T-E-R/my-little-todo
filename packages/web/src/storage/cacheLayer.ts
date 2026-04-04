/**
 * IndexedDB cache was used with the old virtual-file layer.
 * SQLite-backed DataStore reads directly; these are no-ops for compatibility.
 */

interface StreamDayCache {
  dateKey: string;
  entries: unknown[];
}

export async function getCachedTasks(): Promise<unknown[] | null> {
  return null;
}

export async function setCachedTasks(_tasks: unknown[]): Promise<void> {}

export async function getCachedStreamDays(): Promise<StreamDayCache[] | null> {
  return null;
}

export async function setCachedStreamEntries(
  _entries: unknown[],
  _dateKeyFn: (e: unknown) => string,
): Promise<void> {}

export async function clearCache(): Promise<void> {}
