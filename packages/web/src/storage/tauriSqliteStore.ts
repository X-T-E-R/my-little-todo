import {
  type StreamEntryDbRow,
  type TaskDbRow,
  formatDateKey,
  streamEntryFromDbRow,
  streamEntryToDbRow,
  taskFromDbRow,
  taskToDbRow,
} from '@my-little-todo/core';
import type { StreamEntry, Task } from '@my-little-todo/core';
import { getSyncEngine } from '../sync/syncEngine';
import type { AttachmentConfig, UploadResult } from './blobApi';
import type { DataStore, LocalChangeRecord } from './dataStore';
import { CREATE_INDEXES_SQL, CREATE_TABLES_SQL, SCHEMA_VERSION } from './sqliteSchema';

function notifySync(): void {
  try {
    getSyncEngine().notifyLocalChange();
  } catch {
    /* sync engine may not be initialized yet */
  }
}

type Database = Awaited<ReturnType<typeof import('@tauri-apps/plugin-sql').default.load>>;

let _db: Database | null = null;

async function getDb(): Promise<Database> {
  if (_db) return _db;
  const Database = (await import('@tauri-apps/plugin-sql')).default;
  _db = await Database.load('sqlite:data.db');
  return _db;
}

async function ensureSchema(db: Database): Promise<void> {
  for (const sql of CREATE_TABLES_SQL) {
    await db.execute(sql);
  }
  for (const sql of CREATE_INDEXES_SQL) {
    await db.execute(sql);
  }

  await db.execute('INSERT OR IGNORE INTO version_seq (id, current_version) VALUES (1, 0)');

  const rows = await db.select<{ version: number }[]>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
  );
  if (rows.length === 0) {
    await db.execute('INSERT INTO schema_version (version, applied_at) VALUES ($1, $2)', [
      SCHEMA_VERSION,
      Date.now(),
    ]);
  } else {
    const ver = rows[0]?.version ?? 0;
    if (ver < 3) {
      try {
        await db.execute('ALTER TABLE stream_entries ADD COLUMN updated_at INTEGER');
        await db.execute(
          'UPDATE stream_entries SET updated_at = timestamp WHERE updated_at IS NULL',
        );
      } catch {
        /* column may already exist */
      }
      await db.execute(
        'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES ($1, $2)',
        [3, Date.now()],
      );
    }
    const verAfter = (
      await db.select<{ version: number }[]>('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
    )[0]?.version ?? 0;
    if (verAfter < 4) {
      try {
        await db.execute('ALTER TABLE tasks ADD COLUMN role_ids TEXT');
      } catch {
        /* column may already exist */
      }
      await db.execute(
        'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES ($1, $2)',
        [4, Date.now()],
      );
    }
    const verAfter4 = (
      await db.select<{ version: number }[]>('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
    )[0]?.version ?? 0;
    if (verAfter4 < 5) {
      try {
        await db.execute('ALTER TABLE tasks ADD COLUMN title_customized INTEGER NOT NULL DEFAULT 0');
        await db.execute(`UPDATE tasks SET title = '', title_customized = 0`);
      } catch {
        /* column may already exist */
      }
      await db.execute(
        'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES ($1, $2)',
        [SCHEMA_VERSION, Date.now()],
      );
    }
  }
}

/** Single atomic increment (avoids read-then-write races on version_seq). */
async function bumpVersion(db: Database): Promise<number> {
  await db.execute('UPDATE version_seq SET current_version = current_version + 1 WHERE id = 1');
  const rows = await db.select<{ c: number }[]>(
    'SELECT current_version as c FROM version_seq WHERE id = 1',
  );
  return rows[0]?.c ?? 0;
}

function rowToTaskDbRow(r: Record<string, unknown>): TaskDbRow {
  return {
    id: String(r.id),
    title: String(r.title),
    title_customized: r.title_customized != null ? Number(r.title_customized) : 0,
    description: r.description != null ? String(r.description) : null,
    status: String(r.status),
    body: String(r.body),
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    completed_at: r.completed_at != null ? Number(r.completed_at) : null,
    ddl: r.ddl != null ? Number(r.ddl) : null,
    ddl_type: r.ddl_type != null ? String(r.ddl_type) : null,
    planned_at: r.planned_at != null ? Number(r.planned_at) : null,
    role_id: r.role_id != null ? String(r.role_id) : null,
    role_ids: r.role_ids != null ? String(r.role_ids) : null,
    parent_id: r.parent_id != null ? String(r.parent_id) : null,
    source_stream_id: r.source_stream_id != null ? String(r.source_stream_id) : null,
    priority: r.priority != null ? Number(r.priority) : null,
    promoted: r.promoted != null ? Number(r.promoted) : null,
    phase: r.phase != null ? String(r.phase) : null,
    kanban_column: r.kanban_column != null ? String(r.kanban_column) : null,
    tags: String(r.tags ?? '[]'),
    subtask_ids: String(r.subtask_ids ?? '[]'),
    resources: String(r.resources ?? '[]'),
    reminders: String(r.reminders ?? '[]'),
    submissions: String(r.submissions ?? '[]'),
    postponements: String(r.postponements ?? '[]'),
    status_history: String(r.status_history ?? '[]'),
    progress_logs: String(r.progress_logs ?? '[]'),
    version: Number(r.version ?? 0),
    deleted_at: r.deleted_at != null ? Number(r.deleted_at) : null,
  };
}

function rowToStreamDbRow(r: Record<string, unknown>): StreamEntryDbRow {
  return {
    id: String(r.id),
    content: String(r.content),
    entry_type: String(r.entry_type),
    timestamp: Number(r.timestamp),
    date_key: String(r.date_key),
    role_id: r.role_id != null ? String(r.role_id) : null,
    extracted_task_id: r.extracted_task_id != null ? String(r.extracted_task_id) : null,
    tags: String(r.tags ?? '[]'),
    attachments: String(r.attachments ?? '[]'),
    version: Number(r.version ?? 0),
    deleted_at: r.deleted_at != null ? Number(r.deleted_at) : null,
    updated_at:
      r.updated_at != null && r.updated_at !== undefined ? Number(r.updated_at) : undefined,
  };
}

export async function createTauriSqliteDataStore(): Promise<DataStore> {
  const db = await getDb();
  await ensureSchema(db);

  const now = () => Date.now();

  return {
    async getAllTasks(): Promise<Task[]> {
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY updated_at DESC',
      );
      return rows.map((r) => taskFromDbRow(rowToTaskDbRow(r)));
    },

    async getTask(id: string): Promise<Task | null> {
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL',
        [id],
      );
      return rows.length > 0 ? taskFromDbRow(rowToTaskDbRow(rows[0])) : null;
    },

    async putTask(task: Task): Promise<void> {
      const v = await bumpVersion(db);
      const t = { ...task, updatedAt: new Date() };
      const row = taskToDbRow(t, v, null);
      await db.execute(
        `INSERT INTO tasks (
          id, title, title_customized, description, status, body, created_at, updated_at, completed_at,
          ddl, ddl_type, planned_at, role_id, role_ids, parent_id, source_stream_id, priority, promoted, phase, kanban_column,
          tags, subtask_ids, resources, reminders, submissions, postponements, status_history, progress_logs,
          version, deleted_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
        ON CONFLICT(id) DO UPDATE SET
          title=excluded.title, title_customized=excluded.title_customized, description=excluded.description, status=excluded.status, body=excluded.body,
          created_at=excluded.created_at, updated_at=excluded.updated_at, completed_at=excluded.completed_at,
          ddl=excluded.ddl, ddl_type=excluded.ddl_type, planned_at=excluded.planned_at,
          role_id=excluded.role_id, role_ids=excluded.role_ids, parent_id=excluded.parent_id, source_stream_id=excluded.source_stream_id,
          priority=excluded.priority, promoted=excluded.promoted, phase=excluded.phase, kanban_column=excluded.kanban_column,
          tags=excluded.tags, subtask_ids=excluded.subtask_ids, resources=excluded.resources,
          reminders=excluded.reminders, submissions=excluded.submissions, postponements=excluded.postponements,
          status_history=excluded.status_history, progress_logs=excluded.progress_logs,
          version=excluded.version, deleted_at=excluded.deleted_at`,
        [
          row.id,
          row.title,
          row.title_customized,
          row.description,
          row.status,
          row.body,
          row.created_at,
          row.updated_at,
          row.completed_at,
          row.ddl,
          row.ddl_type,
          row.planned_at,
          row.role_id,
          row.role_ids,
          row.parent_id,
          row.source_stream_id,
          row.priority,
          row.promoted,
          row.phase,
          row.kanban_column,
          row.tags,
          row.subtask_ids,
          row.resources,
          row.reminders,
          row.submissions,
          row.postponements,
          row.status_history,
          row.progress_logs,
          row.version,
          row.deleted_at,
        ],
      );
      notifySync();
    },

    async deleteTask(id: string): Promise<void> {
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        'UPDATE tasks SET deleted_at = $1, updated_at = $1, version = $2 WHERE id = $3 AND deleted_at IS NULL',
        [ts, v, id],
      );
      notifySync();
    },

    async getStreamDay(dateKey: string): Promise<StreamEntry[]> {
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM stream_entries WHERE date_key = $1 AND deleted_at IS NULL ORDER BY timestamp ASC',
        [dateKey],
      );
      return rows.map((r) => streamEntryFromDbRow(rowToStreamDbRow(r)));
    },

    async getRecentStream(days = 14): Promise<StreamEntry[]> {
      const min = new Date();
      min.setDate(min.getDate() - days);
      const minKey = formatDateKey(min);
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM stream_entries WHERE deleted_at IS NULL AND date_key >= $1 ORDER BY timestamp DESC',
        [minKey],
      );
      return rows.map((r) => streamEntryFromDbRow(rowToStreamDbRow(r)));
    },

    async listStreamDateKeys(): Promise<string[]> {
      const rows = await db.select<{ date_key: string }[]>(
        'SELECT DISTINCT date_key FROM stream_entries WHERE deleted_at IS NULL ORDER BY date_key DESC',
      );
      return rows.map((r) => r.date_key);
    },

    async searchStreamEntries(query: string, limit = 200): Promise<StreamEntry[]> {
      const needle = query.trim();
      if (!needle) return [];
      const lim = Math.min(Math.max(1, limit), 500);
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM stream_entries WHERE deleted_at IS NULL AND instr(lower(content), lower($1)) > 0 ORDER BY timestamp DESC LIMIT $2',
        [needle, lim],
      );
      return rows.map((r) => streamEntryFromDbRow(rowToStreamDbRow(r)));
    },

    async putStreamEntry(entry: StreamEntry): Promise<void> {
      const v = await bumpVersion(db);
      const row = streamEntryToDbRow(entry, v, null);
      await db.execute(
        `INSERT INTO stream_entries (
          id, content, entry_type, timestamp, date_key, role_id, extracted_task_id,
          tags, attachments, version, deleted_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT(id) DO UPDATE SET
          content=excluded.content, entry_type=excluded.entry_type, timestamp=excluded.timestamp,
          date_key=excluded.date_key, role_id=excluded.role_id, extracted_task_id=excluded.extracted_task_id,
          tags=excluded.tags, attachments=excluded.attachments, version=excluded.version, deleted_at=excluded.deleted_at,
          updated_at=excluded.updated_at`,
        [
          row.id,
          row.content,
          row.entry_type,
          row.timestamp,
          row.date_key,
          row.role_id,
          row.extracted_task_id,
          row.tags,
          row.attachments,
          row.version,
          row.deleted_at,
          row.updated_at ?? row.timestamp,
        ],
      );
      notifySync();
    },

    async deleteStreamEntry(id: string): Promise<void> {
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        'UPDATE stream_entries SET deleted_at = $1, version = $2 WHERE id = $3 AND deleted_at IS NULL',
        [ts, v, id],
      );
      notifySync();
    },

    async getSetting(key: string): Promise<string | null> {
      const rows = await db.select<{ value: string }[]>(
        'SELECT value FROM settings WHERE key = $1 AND deleted_at IS NULL',
        [key],
      );
      return rows.length > 0 ? rows[0].value : null;
    },

    async putSetting(key: string, value: string): Promise<void> {
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        `INSERT INTO settings (key, value, updated_at, version, deleted_at)
         VALUES ($1, $2, $3, $4, NULL)
         ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = $3, version = $4, deleted_at = NULL`,
        [key, value, ts, v],
      );
      if (!key.startsWith('__sync_') && !key.startsWith('sync-')) notifySync();
    },

    async deleteSetting(key: string): Promise<void> {
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        'UPDATE settings SET deleted_at = $1, updated_at = $1, version = $2 WHERE key = $3 AND deleted_at IS NULL',
        [ts, v, key],
      );
      if (!key.startsWith('__sync_') && !key.startsWith('sync-')) notifySync();
    },

    async getAllSettings(): Promise<Record<string, string>> {
      const rows = await db.select<{ key: string; value: string }[]>(
        'SELECT key, value FROM settings WHERE deleted_at IS NULL',
      );
      const result: Record<string, string> = {};
      for (const row of rows) {
        result[row.key] = row.value;
      }
      return result;
    },

    async uploadBlob(file: File): Promise<UploadResult> {
      const id = crypto.randomUUID();
      const buffer = await file.arrayBuffer();
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        `INSERT INTO blobs (id, filename, mime_type, size, data, created_at, deleted_at, version)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)`,
        [
          id,
          file.name,
          file.type || 'application/octet-stream',
          file.size,
          Array.from(new Uint8Array(buffer)),
          ts,
          v,
        ],
      );
      notifySync();
      return {
        id,
        url: `blob://${id}`,
        filename: file.name,
        mime_type: file.type || 'application/octet-stream',
        size: file.size,
      };
    },

    getBlobUrl(id: string): string {
      return `blob://${id}`;
    },

    async deleteBlob(id: string): Promise<void> {
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        'UPDATE blobs SET deleted_at = $1, version = $2 WHERE id = $3 AND deleted_at IS NULL',
        [ts, v, id],
      );
      notifySync();
    },

    async getAttachmentConfig(): Promise<AttachmentConfig> {
      return {
        allow_attachments: true,
        max_size: 50 * 1024 * 1024,
        storage: 'local',
        image_host_url: '',
      };
    },

    async getMaxVersion(): Promise<number> {
      const rows = await db.select<{ c: number }[]>(
        'SELECT current_version as c FROM version_seq WHERE id = 1',
      );
      return rows[0]?.c ?? 0;
    },

    async getChangesSince(sinceVersion: number): Promise<LocalChangeRecord[]> {
      const out: LocalChangeRecord[] = [];

      const taskRows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM tasks WHERE version > $1',
        [sinceVersion],
      );
      for (const r of taskRows) {
        const tr = rowToTaskDbRow(r);
        out.push({
          table: 'tasks',
          key: tr.id,
          data: tr.deleted_at != null ? null : JSON.stringify(tr),
          version: tr.version,
          updatedAt: tr.updated_at,
          deletedAt: tr.deleted_at,
        });
      }

      const streamRows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM stream_entries WHERE version > $1',
        [sinceVersion],
      );
      for (const r of streamRows) {
        const sr = rowToStreamDbRow(r);
        out.push({
          table: 'stream_entries',
          key: sr.id,
          data: sr.deleted_at != null ? null : JSON.stringify(sr),
          version: sr.version,
          updatedAt: sr.updated_at ?? sr.timestamp,
          deletedAt: sr.deleted_at,
        });
      }

      const settingRows = await db.select<Record<string, unknown>[]>(
        "SELECT key, value, updated_at, version, deleted_at FROM settings WHERE version > $1 AND key NOT LIKE '__sync_%'",
        [sinceVersion],
      );
      for (const r of settingRows) {
        const key = String(r.key);
        const version = Number(r.version);
        const updatedAt = Number(r.updated_at);
        const deletedAt = r.deleted_at != null ? Number(r.deleted_at) : null;
        out.push({
          table: 'settings',
          key,
          data:
            deletedAt != null
              ? null
              : JSON.stringify({
                  key,
                  value: String(r.value),
                  updated_at: updatedAt,
                  version,
                  deleted_at: deletedAt,
                }),
          version,
          updatedAt,
          deletedAt,
        });
      }

      const blobRows = await db.select<Record<string, unknown>[]>(
        'SELECT id, filename, mime_type, size, created_at, version, deleted_at FROM blobs WHERE version > $1',
        [sinceVersion],
      );
      for (const r of blobRows) {
        const id = String(r.id);
        const version = Number(r.version);
        const deletedAt = r.deleted_at != null ? Number(r.deleted_at) : null;
        const meta = {
          id,
          filename: String(r.filename),
          mime_type: String(r.mime_type),
          size: Number(r.size),
          created_at: Number(r.created_at),
          version,
          deleted_at: deletedAt,
        };
        out.push({
          table: 'blobs',
          key: id,
          data: deletedAt != null ? null : JSON.stringify(meta),
          version,
          updatedAt: Number(r.created_at),
          deletedAt,
        });
      }

      out.sort((a, b) => a.version - b.version);
      return out;
    },
  };
}
