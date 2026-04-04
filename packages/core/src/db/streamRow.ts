import { formatDateKey } from '../utils/date.js';
import type { Attachment, StreamEntry, StreamEntryType } from '../models/stream.js';

export interface StreamEntryDbRow {
  id: string;
  content: string;
  entry_type: string;
  timestamp: number;
  date_key: string;
  role_id: string | null;
  extracted_task_id: string | null;
  tags: string;
  attachments: string;
  version: number;
  deleted_at: number | null;
  /** Wall-clock update time for LWW sync; defaults to `timestamp` when absent. */
  updated_at?: number;
}

function parseJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function streamEntryFromDbRow(row: StreamEntryDbRow): StreamEntry {
  const tags = parseJson<string[]>(row.tags, []);
  const attachments = parseJson<Attachment[]>(row.attachments, []);
  return {
    id: row.id,
    content: row.content,
    timestamp: new Date(row.timestamp),
    tags,
    attachments,
    extractedTaskId: row.extracted_task_id ?? undefined,
    roleId: row.role_id ?? undefined,
    entryType: row.entry_type as StreamEntryType,
  };
}

export function streamEntryToDbRow(
  entry: StreamEntry,
  version: number,
  deletedAt: number | null,
): StreamEntryDbRow {
  const dateKey = formatDateKey(entry.timestamp);
  const ts = entry.timestamp.getTime();
  return {
    id: entry.id,
    content: entry.content,
    entry_type: entry.entryType,
    timestamp: ts,
    date_key: dateKey,
    role_id: entry.roleId ?? null,
    extracted_task_id: entry.extractedTaskId ?? null,
    tags: JSON.stringify(entry.tags),
    attachments: JSON.stringify(entry.attachments),
    version,
    deleted_at: deletedAt,
    updated_at: Date.now(),
  };
}
