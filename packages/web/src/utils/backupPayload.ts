import {
  type StreamEntry,
  type StreamEntryDbRow,
  type Task,
  type TaskDbRow,
  streamEntryFromDbRow,
  streamEntryToDbRow,
  taskRoleIds,
  taskFromDbRow,
  taskToDbRow,
} from '@my-little-todo/core';
import JSZip from 'jszip';
import type { DataStore } from '../storage/dataStore';
import { hydrateTaskWithEntry } from '../storage/taskEntryBridge';
import { migrateLegacyTaskStreamRows } from '../storage/taskStreamMigration';
import { getPlatform } from './platform';

export type BackupBlobPayload = {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  content_base64: string;
};

export type BackupPayload = {
  kind?: string;
  schema_version?: number;
  export_version?: number;
  platform?: string;
  includes_blobs?: boolean;
  tasks?: string[];
  stream_entries?: string[];
  files?: { path: string; content: string }[];
  settings?: [string, string][];
  blobs?: BackupBlobPayload[];
};

type BackupPayloadStore = Pick<DataStore, 'putTask' | 'putStreamEntry' | 'putSetting'>;

function toBackupTaskRow(task: Task): TaskDbRow {
  const row = taskToDbRow(task, 0, null);
  const roleIds = taskRoleIds(task);
  return {
    ...row,
    body: '',
    role_id: null,
    role_ids: roleIds.length > 0 ? JSON.stringify(roleIds) : null,
    source_stream_id: null,
  };
}

function toBackupStreamEntryRow(entry: StreamEntry): StreamEntryDbRow {
  const row = streamEntryToDbRow(entry, 0, null);
  return {
    ...row,
    extracted_task_id: null,
  };
}

export function buildBackupPayload(options: {
  tasks: Task[];
  streamEntries: StreamEntry[];
  settings: Record<string, string>;
  platform?: string;
  blobs?: BackupBlobPayload[];
}): BackupPayload {
  const { tasks, streamEntries, settings, blobs = [], platform = getPlatform() } = options;

  return {
    kind: 'my-little-todo-backup',
    schema_version: 1,
    export_version: 3,
    platform,
    includes_blobs: blobs.length > 0,
    tasks: tasks.map((task) => JSON.stringify(toBackupTaskRow(task))),
    stream_entries: streamEntries.map((entry) => JSON.stringify(toBackupStreamEntryRow(entry))),
    settings: Object.entries(settings),
    blobs,
  };
}

export async function parseImportPayload(file: File): Promise<BackupPayload> {
  if (!file.name.endsWith('.zip')) {
    return JSON.parse(await file.text()) as BackupPayload;
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const files: { path: string; content: string }[] = [];
  const jsonFile = zip.file('export.json');

  if (jsonFile) {
    return JSON.parse(await jsonFile.async('text')) as BackupPayload;
  }

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || name === '_meta.json') continue;
    files.push({ path: name, content: await entry.async('text') });
  }

  return { files };
}

export function isLegacyBackupPayload(payload: BackupPayload): boolean {
  return Boolean(payload.files && payload.files.length > 0 && !payload.tasks?.length);
}

export async function importPayloadToStore(
  store: BackupPayloadStore,
  payload: BackupPayload,
): Promise<{
  tasksImported: number;
  streamImported: number;
  settingsImported: number;
}> {
  let tasksImported = 0;
  let streamImported = 0;
  let settingsImported = 0;

  const migrated = migrateLegacyTaskStreamRows({
    tasks: (payload.tasks ?? []).map((raw) => JSON.parse(raw) as TaskDbRow),
    streamEntries: (payload.stream_entries ?? []).map((raw) => JSON.parse(raw) as StreamEntryDbRow),
  });

  for (const row of migrated.streamEntries) {
    await store.putStreamEntry(streamEntryFromDbRow(row));
    streamImported++;
  }

  const migratedStreamRowsById = new Map(
    migrated.streamEntries.map((row) => [row.id, row] as const),
  );

  for (const row of migrated.tasks) {
    const entryRow = migratedStreamRowsById.get(row.id);
    const task = hydrateTaskWithEntry(
      taskFromDbRow(row),
      entryRow ? streamEntryFromDbRow(entryRow) : undefined,
    );
    await store.putTask(task);
    tasksImported++;
  }

  for (const [key, value] of payload.settings ?? []) {
    await store.putSetting(key, value);
    settingsImported++;
  }

  return {
    tasksImported,
    streamImported,
    settingsImported,
  };
}
