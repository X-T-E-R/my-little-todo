import type { StreamEntry, StreamEntryType } from '@my-little-todo/core';
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
    attachments: [],
    roleId: roleId || undefined,
    entryType,
  };

  await getDataStore().putStreamEntry(entry);
  return entry;
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
  dateKey: string,
  taskId: string,
): Promise<void> {
  const existing = await loadStreamDay(dateKey);
  const entry = existing.find((e) => e.id === entryId);
  if (!entry) return;
  entry.extractedTaskId = taskId;
  await getDataStore().putStreamEntry(entry);
}

function extractTags(text: string): string[] {
  const matches = text.matchAll(/#([\w\u4e00-\u9fff]+)/g);
  return [...matches].map((m) => m[1]).filter((t): t is string => t !== undefined);
}

export async function listStreamDates(): Promise<string[]> {
  return getDataStore().listStreamDateKeys();
}
