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
import type { AttachmentConfig, UploadResult } from './blobApi';
import type { DataStore, LocalChangeRecord } from './dataStore';
import { CREATE_INDEXES_SQL, CREATE_TABLES_SQL, SCHEMA_VERSION } from './sqliteSchema';

type CapDB = {
  execute(statement: string, values?: unknown[]): Promise<{ changes?: { changes?: number } }>;
  query(statement: string, values?: unknown[]): Promise<{ values?: Record<string, unknown>[] }>;
};

async function openCapacitorDb(): Promise<CapDB> {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);

  const dbName = 'mlt-data';
  const ret = await sqlite.checkConnectionsConsistency();
  const isConn = (await sqlite.isConnection(dbName, false)).result;

  let db: Awaited<ReturnType<typeof sqlite.createConnection>>;
  if (ret.result && isConn) {
    db = await sqlite.retrieveConnection(dbName, false);
  } else {
    db = await sqlite.createConnection(dbName, false, 'no-encryption', 1, false);
  }

  await db.open();

  return {
    async execute(statement: string, values?: unknown[]) {
      const r = await db.execute(statement, values !== undefined);
      return { changes: r.changes };
    },
    async query(statement: string, values?: unknown[]) {
      const r = await db.query(statement, values as string[] | undefined);
      return { values: r.values as Record<string, unknown>[] | undefined };
    },
  };
}

async function ensureSchema(db: CapDB): Promise<void> {
  for (const sql of CREATE_TABLES_SQL) {
    await db.execute(sql);
  }
  for (const sql of CREATE_INDEXES_SQL) {
    await db.execute(sql);
  }

  await db.execute('INSERT OR IGNORE INTO version_seq (id, current_version) VALUES (1, 0)');

  const rows = await db.query('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
  if (!rows.values || rows.values.length === 0) {
    await db.execute(
      `INSERT INTO schema_version (version, applied_at) VALUES (${SCHEMA_VERSION}, ${Date.now()})`,
    );
  } else {
    const ver = rows.values[0]?.version != null ? Number(rows.values[0].version) : 0;
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
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (3, ${Date.now()})`,
      );
    }
    const rows2 = await db.query('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
    const ver2 = rows2.values?.[0]?.version != null ? Number(rows2.values[0].version) : 0;
    if (ver2 < 4) {
      try {
        await db.execute('ALTER TABLE tasks ADD COLUMN role_ids TEXT');
      } catch {
        /* column may already exist */
      }
      await db.execute(
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (4, ${Date.now()})`,
      );
    }
    const rows3 = await db.query('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
    const ver3 = rows3.values?.[0]?.version != null ? Number(rows3.values[0].version) : 0;
    if (ver3 < 5) {
      try {
        await db.execute('ALTER TABLE tasks ADD COLUMN title_customized INTEGER NOT NULL DEFAULT 0');
        await db.execute(`UPDATE tasks SET title = '', title_customized = 0`);
      } catch {
        /* column may already exist */
      }
      await db.execute(
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (${SCHEMA_VERSION}, ${Date.now()})`,
      );
    }
  }
}

async function bumpVersion(db: CapDB): Promise<number> {
  await db.execute('UPDATE version_seq SET current_version = current_version + 1 WHERE id = 1');
  const rows = await db.query('SELECT current_version as c FROM version_seq WHERE id = 1');
  return rows.values?.[0]?.c != null ? Number(rows.values[0].c) : 0;
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

export async function createCapacitorSqliteDataStore(): Promise<DataStore> {
  const db = await openCapacitorDb();
  await ensureSchema(db);

  const now = () => Date.now();

  return {
    async getAllTasks(): Promise<Task[]> {
      const rows = await db.query(
        'SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY updated_at DESC',
      );
      if (!rows.values) return [];
      return rows.values.map((r) => taskFromDbRow(rowToTaskDbRow(r)));
    },

    async getTask(id: string): Promise<Task | null> {
      const rows = await db.query('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!rows.values?.length) return null;
      return taskFromDbRow(rowToTaskDbRow(rows.values[0]));
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
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
    },

    async deleteTask(id: string): Promise<void> {
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        'UPDATE tasks SET deleted_at = ?, updated_at = ?, version = ? WHERE id = ? AND deleted_at IS NULL',
        [ts, ts, v, id],
      );
    },

    async getStreamDay(dateKey: string): Promise<StreamEntry[]> {
      const rows = await db.query(
        'SELECT * FROM stream_entries WHERE date_key = ? AND deleted_at IS NULL ORDER BY timestamp ASC',
        [dateKey],
      );
      if (!rows.values) return [];
      return rows.values.map((r) => streamEntryFromDbRow(rowToStreamDbRow(r)));
    },

    async getRecentStream(days = 14): Promise<StreamEntry[]> {
      const min = new Date();
      min.setDate(min.getDate() - days);
      const minKey = formatDateKey(min);
      const rows = await db.query(
        'SELECT * FROM stream_entries WHERE deleted_at IS NULL AND date_key >= ? ORDER BY timestamp DESC',
        [minKey],
      );
      if (!rows.values) return [];
      return rows.values.map((r) => streamEntryFromDbRow(rowToStreamDbRow(r)));
    },

    async listStreamDateKeys(): Promise<string[]> {
      const rows = await db.query(
        'SELECT DISTINCT date_key FROM stream_entries WHERE deleted_at IS NULL ORDER BY date_key DESC',
      );
      if (!rows.values) return [];
      return rows.values.map((r) => String(r.date_key));
    },

    async searchStreamEntries(query: string, limit = 200): Promise<StreamEntry[]> {
      const needle = query.trim();
      if (!needle) return [];
      const lim = Math.min(Math.max(1, limit), 500);
      const rows = await db.query(
        'SELECT * FROM stream_entries WHERE deleted_at IS NULL AND instr(lower(content), lower(?)) > 0 ORDER BY timestamp DESC LIMIT ?',
        [needle, lim],
      );
      if (!rows.values) return [];
      return rows.values.map((r) => streamEntryFromDbRow(rowToStreamDbRow(r)));
    },

    async putStreamEntry(entry: StreamEntry): Promise<void> {
      const v = await bumpVersion(db);
      const row = streamEntryToDbRow(entry, v, null);
      await db.execute(
        `INSERT INTO stream_entries (
          id, content, entry_type, timestamp, date_key, role_id, extracted_task_id,
          tags, attachments, version, deleted_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
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
    },

    async deleteStreamEntry(id: string): Promise<void> {
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        'UPDATE stream_entries SET deleted_at = ?, version = ? WHERE id = ? AND deleted_at IS NULL',
        [ts, v, id],
      );
    },

    async getSetting(key: string): Promise<string | null> {
      const rows = await db.query(
        'SELECT value FROM settings WHERE key = ? AND deleted_at IS NULL',
        [key],
      );
      return rows.values?.length ? (rows.values[0].value as string) : null;
    },

    async putSetting(key: string, value: string): Promise<void> {
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        `INSERT INTO settings (key, value, updated_at, version, deleted_at)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, version = excluded.version, deleted_at = NULL`,
        [key, value, ts, v],
      );
    },

    async deleteSetting(key: string): Promise<void> {
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        'UPDATE settings SET deleted_at = ?, updated_at = ?, version = ? WHERE key = ? AND deleted_at IS NULL',
        [ts, ts, v, key],
      );
    },

    async getAllSettings(): Promise<Record<string, string>> {
      const rows = await db.query('SELECT key, value FROM settings WHERE deleted_at IS NULL');
      const result: Record<string, string> = {};
      if (rows.values) {
        for (const row of rows.values) {
          result[row.key as string] = row.value as string;
        }
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
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
        [
          id,
          file.name,
          file.type || 'application/octet-stream',
          file.size,
          new Uint8Array(buffer),
          ts,
          v,
        ],
      );
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
        'UPDATE blobs SET deleted_at = ?, version = ? WHERE id = ? AND deleted_at IS NULL',
        [ts, v, id],
      );
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
      const rows = await db.query('SELECT current_version as c FROM version_seq WHERE id = 1');
      return rows.values?.[0]?.c != null ? Number(rows.values[0].c) : 0;
    },

    async getChangesSince(sinceVersion: number): Promise<LocalChangeRecord[]> {
      const out: LocalChangeRecord[] = [];

      const taskRows = await db.query('SELECT * FROM tasks WHERE version > ?', [sinceVersion]);
      if (taskRows.values) {
        for (const r of taskRows.values) {
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
      }

      const streamRows = await db.query('SELECT * FROM stream_entries WHERE version > ?', [
        sinceVersion,
      ]);
      if (streamRows.values) {
        for (const r of streamRows.values) {
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
      }

      const settingRows = await db.query(
        "SELECT key, value, updated_at, version, deleted_at FROM settings WHERE version > ? AND key NOT LIKE '__sync_%'",
        [sinceVersion],
      );
      if (settingRows.values) {
        for (const r of settingRows.values) {
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
      }

      const blobRows = await db.query(
        'SELECT id, filename, mime_type, size, created_at, version, deleted_at FROM blobs WHERE version > ?',
        [sinceVersion],
      );
      if (blobRows.values) {
        for (const r of blobRows.values) {
          const bid = String(r.id);
          const version = Number(r.version);
          const deletedAt = r.deleted_at != null ? Number(r.deleted_at) : null;
          const meta = {
            id: bid,
            filename: String(r.filename),
            mime_type: String(r.mime_type),
            size: Number(r.size),
            created_at: Number(r.created_at),
            version,
            deleted_at: deletedAt,
          };
          out.push({
            table: 'blobs',
            key: bid,
            data: deletedAt != null ? null : JSON.stringify(meta),
            version,
            updatedAt: Number(r.created_at),
            deletedAt,
          });
        }
      }

      out.sort((a, b) => a.version - b.version);
      return out;
    },
  };
}
