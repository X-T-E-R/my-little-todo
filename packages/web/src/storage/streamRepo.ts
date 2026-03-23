import type { StreamEntry, StreamEntryType } from '@my-little-todo/core';
import {
  STREAM_DIR,
  formatDateKey,
  formatTimeStorage,
  parseStreamFile,
  serializeStreamFile,
} from '@my-little-todo/core';
import { listFiles, readFile, writeFile } from './adapter';

function dateKeyToFileName(dateKey: string): string {
  return `${dateKey}.md`;
}

function fileNameToDateKey(name: string): string {
  return name.replace('.md', '');
}

export async function loadStreamDay(dateKey: string): Promise<StreamEntry[]> {
  const content = await readFile(STREAM_DIR, dateKeyToFileName(dateKey));
  if (!content) return [];
  return parseStreamFile(content, dateKey);
}

export async function loadRecentDays(count = 7): Promise<StreamEntry[]> {
  const files = await listFiles(STREAM_DIR);
  const recent = files.slice(0, count);

  const allEntries: StreamEntry[] = [];
  for (const file of recent) {
    const dateKey = fileNameToDateKey(file);
    const entries = await loadStreamDay(dateKey);
    allEntries.push(...entries);
  }
  return allEntries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
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

  existing.push(entry);
  const serialized = serializeStreamFile(existing, dateKey);
  await writeFile(serialized, STREAM_DIR, dateKeyToFileName(dateKey));

  return entry;
}

export async function updateStreamEntry(entry: StreamEntry): Promise<void> {
  const dateKey = formatDateKey(entry.timestamp);
  const existing = await loadStreamDay(dateKey);
  const idx = existing.findIndex((e) => e.id === entry.id);
  if (idx === -1) return;
  existing[idx] = { ...entry, tags: extractTags(entry.content) };
  const serialized = serializeStreamFile(existing, dateKey);
  await writeFile(serialized, STREAM_DIR, dateKeyToFileName(dateKey));
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
  const serialized = serializeStreamFile(existing, dateKey);
  await writeFile(serialized, STREAM_DIR, dateKeyToFileName(dateKey));
}

function extractTags(text: string): string[] {
  const matches = text.matchAll(/#([\w\u4e00-\u9fff]+)/g);
  return [...matches].map((m) => m[1]).filter((t): t is string => t !== undefined);
}

export async function listStreamDates(): Promise<string[]> {
  const files = await listFiles(STREAM_DIR);
  return files.map(fileNameToDateKey);
}
