import type { Attachment, StreamEntry, StreamEntryType } from '@my-little-todo/core';
import { formatDateKey, formatTimeStorage } from '@my-little-todo/core';
import { getDataStore } from './dataStore';

export async function loadStreamDay(dateKey: string): Promise<StreamEntry[]> {
  return getDataStore().getStreamDay(dateKey);
}

export async function loadRecentDays(count = 7): Promise<StreamEntry[]> {
  return getDataStore().getRecentStream(count);
}

/**
 * Build a canonical stream entry ID matching what the parser generates.
 * Format: se-YYYYMMDD-HHMMSS (same as parser uses from the HH:MM:SS time).
 */
function canonicalStreamId(dateKey: string, timestamp: Date, existing: StreamEntry[]): string {
  const timePart = formatTimeStorage(timestamp).replace(/:/g, '');
  const baseId = `se-${dateKey.replace(/-/g, '')}-${timePart}`;
  const count = existing.filter((e) => e.id === baseId || e.id.startsWith(`${baseId}-`)).length;
  return count === 0 ? baseId : `${baseId}-${count}`;
}

export async function addStreamEntry(
  content: string,
  roleId?: string,
  entryType: StreamEntryType = 'spark',
  attachments: Attachment[] = [],
  threadMeta?: StreamEntry['threadMeta'],
): Promise<StreamEntry> {
  const now = new Date();
  const dateKey = formatDateKey(now);

  const existing = await loadStreamDay(dateKey);

  const id = canonicalStreamId(dateKey, now, existing);
  const entry: StreamEntry = {
    id,
    content,
    timestamp: now,
    tags: extractTags(content),
    attachments,
    roleId: roleId || undefined,
    entryType,
    threadMeta,
  };

  await getDataStore().putStreamEntry(entry);
  return entry;
}

export async function putCanonicalStreamEntry(entry: StreamEntry): Promise<StreamEntry> {
  const canonical: StreamEntry = {
    ...entry,
    tags: extractTags(entry.content),
  };
  await getDataStore().putStreamEntry(canonical);
  return canonical;
}

export async function updateStreamEntry(entry: StreamEntry): Promise<void> {
  const e = { ...entry, tags: extractTags(entry.content) };
  await getDataStore().putStreamEntry(e);
}

export async function deleteStreamEntry(id: string): Promise<void> {
  await getDataStore().deleteStreamEntry(id);
}

export async function linkEntryToTask(
  entryId: string,
  _dateKey: string,
  taskId: string,
): Promise<void> {
  if (entryId !== taskId) {
    throw new Error(`Canonical task-entry id mismatch: ${entryId} !== ${taskId}`);
  }
}

function extractTags(text: string): string[] {
  const matches = text.matchAll(/#([\w\u4e00-\u9fff]+)/g);
  return [...matches].map((m) => m[1]).filter((t): t is string => t !== undefined);
}

export async function listStreamDates(): Promise<string[]> {
  return getDataStore().listStreamDateKeys();
}

export async function searchStreamEntries(query: string, limit = 200) {
  return getDataStore().searchStreamEntries(query, limit);
}

/** Random spark older than `minAgeDays` (from recent window). Used by time capsule. */
export async function pickTimeCapsuleEntry(minAgeDays: number) {
  const entries = await loadRecentDays(Math.max(minAgeDays + 1, 120));
  const cutoff = Date.now() - minAgeDays * 86400000;
  const sparks = entries.filter((e) => e.entryType === 'spark' && e.timestamp.getTime() < cutoff);
  if (sparks.length === 0) return null;
  return sparks[Math.floor(Math.random() * sparks.length)] ?? null;
}
