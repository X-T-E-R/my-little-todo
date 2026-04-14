import {
  type StreamEntryDbRow,
  type TaskDbRow,
  type WindowContextDbRow,
  formatDateKey,
  streamEntryFromDbRow,
  streamEntryToDbRow,
  taskFromDbRow,
  taskToDbRow,
  windowContextFromDbRow,
  windowContextToDbRow,
} from '@my-little-todo/core';
import type {
  StreamEntry,
  Task,
  ThinkSession,
  WindowContext,
  WorkThread,
  WorkThreadEvent,
} from '@my-little-todo/core';
import { getSyncEngine } from '../sync/syncEngine';
import type { AttachmentConfig, UploadResult } from './blobApi';
import type { DataStore, LocalChangeRecord } from './dataStore';
import { CREATE_INDEXES_SQL, CREATE_TABLES_SQL, SCHEMA_VERSION } from './sqliteSchema';
import {
  deriveTaskFacetFromEntry,
  hydrateTaskWithEntry,
  normalizeTaskRoleIds,
  shouldProjectStreamRoleToTask,
} from './taskEntryBridge';
import {
  deserializeWorkThread,
  deserializeWorkThreadEvent,
  serializeWorkThread,
} from './workThreadStorage';

function notifySync(): void {
  try {
    getSyncEngine().notifyLocalChange();
  } catch {
    /* sync engine may not be initialized yet */
  }
}

type Database = Awaited<ReturnType<typeof import('@tauri-apps/plugin-sql').default.load>>;

let _db: Database | null = null;

function coerceBlobBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value.map((item) => Number(item) || 0));
  return new Uint8Array();
}

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
    const verAfter =
      (
        await db.select<{ version: number }[]>(
          'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
        )
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
    const verAfter4 =
      (
        await db.select<{ version: number }[]>(
          'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
        )
      )[0]?.version ?? 0;
    if (verAfter4 < 5) {
      try {
        await db.execute(
          'ALTER TABLE tasks ADD COLUMN title_customized INTEGER NOT NULL DEFAULT 0',
        );
        await db.execute(
          'UPDATE tasks SET title_customized = CASE WHEN length(trim(title)) > 0 THEN 1 ELSE 0 END',
        );
      } catch {
        /* column may already exist */
      }
      await db.execute(
        'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES ($1, $2)',
        [5, Date.now()],
      );
    }
    const verAfter5 =
      (
        await db.select<{ version: number }[]>(
          'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
        )
      )[0]?.version ?? 0;
    if (verAfter5 < 6) {
      await db.execute(
        'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES ($1, $2)',
        [6, Date.now()],
      );
    }
    const verAfter6 =
      (
        await db.select<{ version: number }[]>(
          'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
        )
      )[0]?.version ?? 0;
    if (verAfter6 < 7) {
      await db.execute(
        'UPDATE tasks SET title_customized = 1 WHERE length(trim(title)) > 0 AND title_customized = 0',
      );
      await db.execute(
        'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES ($1, $2)',
        [7, Date.now()],
      );
    }
    const verAfter7 =
      (
        await db.select<{ version: number }[]>(
          'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
        )
      )[0]?.version ?? 0;
    if (verAfter7 < 8) {
      try {
        await db.execute('ALTER TABLE window_contexts ADD COLUMN display_name TEXT');
      } catch {
        /* column may already exist */
      }
      await db.execute(
        'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES ($1, $2)',
        [8, Date.now()],
      );
    }
    const verAfter8 =
      (
        await db.select<{ version: number }[]>(
          'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
        )
      )[0]?.version ?? 0;
    if (verAfter8 < 9) {
      try {
        await db.execute('ALTER TABLE tasks ADD COLUMN task_type TEXT');
      } catch {
        /* column may already exist */
      }
      await db.execute(
        'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES ($1, $2)',
        [9, Date.now()],
      );
    }
    const verAfter9 =
      (
        await db.select<{ version: number }[]>(
          'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
        )
      )[0]?.version ?? 0;
    if (verAfter9 < 10) {
      await db.execute(`CREATE TABLE IF NOT EXISTS think_sessions (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL DEFAULT '',
        start_mode TEXT NOT NULL DEFAULT 'blank',
        extracted_actions TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
      try {
        await db.execute(
          'CREATE INDEX IF NOT EXISTS idx_think_sessions_updated ON think_sessions(updated_at DESC)',
        );
      } catch {
        /* index may exist */
      }
      await db.execute(
        'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES ($1, $2)',
        [10, Date.now()],
      );
    }
    const verAfter10 =
      (
        await db.select<{ version: number }[]>(
          'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
        )
      )[0]?.version ?? 0;
    if (verAfter10 < 11) {
      await db.execute(`CREATE TABLE IF NOT EXISTS work_threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        mission TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'ready',
        lane TEXT NOT NULL DEFAULT 'general',
        role_id TEXT,
        doc_markdown TEXT NOT NULL DEFAULT '',
        context_items TEXT NOT NULL DEFAULT '[]',
        next_actions TEXT NOT NULL DEFAULT '[]',
        resume_card TEXT NOT NULL DEFAULT '{}',
        working_set TEXT NOT NULL DEFAULT '[]',
        waiting_for TEXT NOT NULL DEFAULT '[]',
        interrupts TEXT NOT NULL DEFAULT '[]',
        scheduler_meta TEXT NOT NULL DEFAULT '{}',
        sync_meta TEXT NOT NULL DEFAULT '{"mode":"internal"}',
        suggestions TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS work_thread_events (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        type TEXT NOT NULL,
        actor TEXT NOT NULL,
        title TEXT NOT NULL,
        detail_markdown TEXT,
        payload TEXT,
        created_at INTEGER NOT NULL
      )`);
      try {
        await db.execute(
          'CREATE INDEX IF NOT EXISTS idx_work_threads_updated ON work_threads(updated_at DESC)',
        );
        await db.execute(
          'CREATE INDEX IF NOT EXISTS idx_work_thread_events_thread ON work_thread_events(thread_id, created_at DESC)',
        );
      } catch {
        /* index may exist */
      }
      await db.execute(
        'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES ($1, $2)',
        [11, Date.now()],
      );
    }
    const verAfter11 =
      (
        await db.select<{ version: number }[]>(
          'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
        )
      )[0]?.version ?? 0;
    if (verAfter11 < 12) {
      const alterColumns = [
        "ALTER TABLE work_threads ADD COLUMN mission TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE work_threads ADD COLUMN lane TEXT NOT NULL DEFAULT 'general'",
        "ALTER TABLE work_threads ADD COLUMN resume_card TEXT NOT NULL DEFAULT '{}'",
        "ALTER TABLE work_threads ADD COLUMN working_set TEXT NOT NULL DEFAULT '[]'",
        "ALTER TABLE work_threads ADD COLUMN waiting_for TEXT NOT NULL DEFAULT '[]'",
        "ALTER TABLE work_threads ADD COLUMN interrupts TEXT NOT NULL DEFAULT '[]'",
        "ALTER TABLE work_threads ADD COLUMN scheduler_meta TEXT NOT NULL DEFAULT '{}'",
      ];
      for (const sql of alterColumns) {
        try {
          await db.execute(sql);
        } catch {
          /* column may already exist */
        }
      }
      await db.execute(
        "UPDATE work_threads SET mission = CASE WHEN trim(mission) = '' THEN title ELSE mission END",
      );
      await db.execute(
        "UPDATE work_threads SET status = CASE WHEN status = 'active' THEN 'ready' WHEN status = 'paused' THEN 'sleeping' ELSE status END",
      );
      await db.execute(
        'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES ($1, $2)',
        [12, Date.now()],
      );
    }
    const verAfter12 =
      (
        await db.select<{ version: number }[]>(
          'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
        )
      )[0]?.version ?? 0;
    if (verAfter12 < 13) {
      try {
        await db.execute(
          `ALTER TABLE work_threads ADD COLUMN sync_meta TEXT NOT NULL DEFAULT '{"mode":"internal"}'`,
        );
      } catch {
        /* column may already exist */
      }
      await db.execute(
        "UPDATE work_threads SET sync_meta = '{\"mode\":\"internal\"}' WHERE trim(COALESCE(sync_meta, '')) = ''",
      );
      await db.execute(
        'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES ($1, $2)',
        [13, Date.now()],
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
    task_type: r.task_type != null ? String(r.task_type) : null,
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

function thinkSessionFromRow(r: Record<string, unknown>): ThinkSession {
  const raw = r.extracted_actions;
  let extracted: ThinkSession['extractedActions'];
  if (raw != null && String(raw).trim() !== '') {
    try {
      extracted = JSON.parse(String(raw)) as ThinkSession['extractedActions'];
    } catch {
      extracted = undefined;
    }
  }
  return {
    id: String(r.id),
    content: String(r.content ?? ''),
    startMode: (String(r.start_mode) as ThinkSession['startMode']) || 'blank',
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    extractedActions: extracted,
  };
}

function workThreadFromRow(r: Record<string, unknown>): WorkThread {
  return deserializeWorkThread(r);
}

function workThreadEventFromRow(r: Record<string, unknown>): WorkThreadEvent {
  return deserializeWorkThreadEvent(r);
}

function rowToWindowContextDbRow(r: Record<string, unknown>): WindowContextDbRow {
  return {
    id: String(r.id),
    process_name: r.process_name != null ? String(r.process_name) : null,
    display_name: r.display_name != null ? String(r.display_name) : null,
    title_pattern: r.title_pattern != null ? String(r.title_pattern) : null,
    match_mode: String(r.match_mode ?? 'contains'),
    role_ids: String(r.role_ids ?? '[]'),
    note: String(r.note ?? ''),
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    last_matched_at: r.last_matched_at != null ? Number(r.last_matched_at) : null,
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

function resolvedStreamEntryId(taskRow: TaskDbRow): string {
  return taskRow.source_stream_id ?? taskRow.id;
}

function taskFromJoinedRows(
  taskRow: TaskDbRow,
  streamRowsById: Map<string, StreamEntryDbRow>,
): Task {
  const baseTask = taskFromDbRow(taskRow);
  const streamRow =
    streamRowsById.get(taskRow.id) ?? streamRowsById.get(resolvedStreamEntryId(taskRow));
  const entry = streamRow ? streamEntryFromDbRow(streamRow) : undefined;
  return hydrateTaskWithEntry(baseTask, entry);
}

function streamEntriesWithTaskLinks(
  streamRows: Record<string, unknown>[],
  taskRows: TaskDbRow[],
): StreamEntry[] {
  const entryToTaskId = new Map<string, string>();
  for (const taskRow of taskRows) {
    entryToTaskId.set(resolvedStreamEntryId(taskRow), taskRow.id);
  }
  return streamRows.map((row) => {
    const entry = streamEntryFromDbRow(rowToStreamDbRow(row));
    return {
      ...entry,
      extractedTaskId: entryToTaskId.get(entry.id),
    };
  });
}

export async function createTauriSqliteDataStore(): Promise<DataStore> {
  const db = await getDb();
  await ensureSchema(db);

  const now = () => Date.now();
  const deleteTaskFacet = async (id: string): Promise<void> => {
    const ts = now();
    const v = await bumpVersion(db);
    await db.execute(
      'UPDATE tasks SET deleted_at = $1, updated_at = $1, version = $2 WHERE id = $3 AND deleted_at IS NULL',
      [ts, ts, v, id],
    );
    notifySync();
  };

  return {
    async getAllTasks(): Promise<Task[]> {
      const [taskRows, streamRows] = await Promise.all([
        db.select<Record<string, unknown>[]>(
          'SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY updated_at DESC',
        ),
        db.select<Record<string, unknown>[]>('SELECT * FROM stream_entries WHERE deleted_at IS NULL'),
      ]);
      const taskDbRows = taskRows.map((r) => rowToTaskDbRow(r));
      const streamRowsById = new Map(
        streamRows.map((r) => {
          const row = rowToStreamDbRow(r);
          return [row.id, row] as const;
        }),
      );
      return taskDbRows.map((row) => taskFromJoinedRows(row, streamRowsById));
    },

    async getTask(id: string): Promise<Task | null> {
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL',
        [id],
      );
      const taskRowRaw = rows[0];
      if (!taskRowRaw) return null;
      const taskRow = rowToTaskDbRow(taskRowRaw);
      const streamIds = [...new Set([taskRow.id, resolvedStreamEntryId(taskRow)])];
      const placeholders = streamIds.map((_value, index) => `$${index + 1}`).join(', ');
      const streamRows = await db.select<Record<string, unknown>[]>(
        `SELECT * FROM stream_entries WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        streamIds,
      );
      const streamRowsById = new Map(
        streamRows.map((r) => {
          const row = rowToStreamDbRow(r);
          return [row.id, row] as const;
        }),
      );
      return taskFromJoinedRows(taskRow, streamRowsById);
    },

    async putTask(task: Task): Promise<void> {
      const existingStreamRows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM stream_entries WHERE id = $1 AND deleted_at IS NULL',
        [task.id],
      );
      const existingStream = existingStreamRows[0]
        ? streamEntryFromDbRow(rowToStreamDbRow(existingStreamRows[0]))
        : undefined;
      const canonicalEntry: StreamEntry = {
        id: task.id,
        content: task.body,
        timestamp: existingStream?.timestamp ?? task.createdAt,
        tags: task.tags,
        attachments: existingStream?.attachments ?? [],
        roleId: normalizeTaskRoleIds(task, existingStream?.roleId)[0],
        entryType: 'task',
      };
      const streamVersion = await bumpVersion(db);
      const streamRow = streamEntryToDbRow(canonicalEntry, streamVersion, null);
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
          streamRow.id,
          streamRow.content,
          streamRow.entry_type,
          streamRow.timestamp,
          streamRow.date_key,
          streamRow.role_id,
          null,
          streamRow.tags,
          streamRow.attachments,
          streamRow.version,
          streamRow.deleted_at,
          streamRow.updated_at ?? streamRow.timestamp,
        ],
      );

      const v = await bumpVersion(db);
      const t = deriveTaskFacetFromEntry({ ...task, updatedAt: new Date() }, canonicalEntry);
      const row = taskToDbRow(t, v, null);
      await db.execute(
        `INSERT INTO tasks (
          id, title, title_customized, description, status, body, created_at, updated_at, completed_at,
          ddl, ddl_type, planned_at, role_id, role_ids, parent_id, source_stream_id, priority, promoted, phase, kanban_column,
          task_type,
          tags, subtask_ids, resources, reminders, submissions, postponements, status_history, progress_logs,
          version, deleted_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
        ON CONFLICT(id) DO UPDATE SET
          title=excluded.title, title_customized=excluded.title_customized, description=excluded.description, status=excluded.status, body=excluded.body,
          created_at=excluded.created_at, updated_at=excluded.updated_at, completed_at=excluded.completed_at,
          ddl=excluded.ddl, ddl_type=excluded.ddl_type, planned_at=excluded.planned_at,
          role_id=excluded.role_id, role_ids=excluded.role_ids, parent_id=excluded.parent_id, source_stream_id=excluded.source_stream_id,
          priority=excluded.priority, promoted=excluded.promoted, phase=excluded.phase, kanban_column=excluded.kanban_column,
          task_type=excluded.task_type,
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
          '',
          row.created_at,
          row.updated_at,
          row.completed_at,
          row.ddl,
          row.ddl_type,
          row.planned_at,
          null,
          row.role_ids ?? JSON.stringify(normalizeTaskRoleIds(task, canonicalEntry.roleId)),
          row.parent_id,
          null,
          row.priority,
          row.promoted,
          row.phase,
          row.kanban_column,
          row.task_type,
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
      await deleteTaskFacet(id);
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        'UPDATE stream_entries SET deleted_at = $1, version = $2 WHERE id = $3 AND deleted_at IS NULL',
        [ts, v, id],
      );
      notifySync();
    },

    deleteTaskFacet,

    async getStreamDay(dateKey: string): Promise<StreamEntry[]> {
      const [rows, taskRows] = await Promise.all([
        db.select<Record<string, unknown>[]>(
          'SELECT * FROM stream_entries WHERE date_key = $1 AND deleted_at IS NULL ORDER BY timestamp ASC',
          [dateKey],
        ),
        db.select<Record<string, unknown>[]>('SELECT * FROM tasks WHERE deleted_at IS NULL'),
      ]);
      return streamEntriesWithTaskLinks(rows, taskRows.map((r) => rowToTaskDbRow(r)));
    },

    async getRecentStream(days = 14): Promise<StreamEntry[]> {
      const min = new Date();
      min.setDate(min.getDate() - days);
      const minKey = formatDateKey(min);
      const [rows, taskRows] = await Promise.all([
        db.select<Record<string, unknown>[]>(
          'SELECT * FROM stream_entries WHERE deleted_at IS NULL AND date_key >= $1 ORDER BY timestamp DESC',
          [minKey],
        ),
        db.select<Record<string, unknown>[]>('SELECT * FROM tasks WHERE deleted_at IS NULL'),
      ]);
      return streamEntriesWithTaskLinks(rows, taskRows.map((r) => rowToTaskDbRow(r)));
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
      const [rows, taskRows] = await Promise.all([
        db.select<Record<string, unknown>[]>(
          'SELECT * FROM stream_entries WHERE deleted_at IS NULL AND instr(lower(content), lower($1)) > 0 ORDER BY timestamp DESC LIMIT $2',
          [needle, lim],
        ),
        db.select<Record<string, unknown>[]>('SELECT * FROM tasks WHERE deleted_at IS NULL'),
      ]);
      return streamEntriesWithTaskLinks(rows, taskRows.map((r) => rowToTaskDbRow(r)));
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
          null,
          row.tags,
          row.attachments,
          row.version,
          row.deleted_at,
          row.updated_at ?? row.timestamp,
        ],
      );
      const linkedTaskRows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL',
        [entry.id],
      );
      const linkedTaskRaw = linkedTaskRows[0];
      if (linkedTaskRaw) {
        const linkedTask = taskFromDbRow(rowToTaskDbRow(linkedTaskRaw));
        if (shouldProjectStreamRoleToTask(linkedTask)) {
          const roleIds = normalizeTaskRoleIds(linkedTask, entry.roleId);
          const nextVersion = await bumpVersion(db);
          await db.execute(
            'UPDATE tasks SET role_ids = $1, role_id = NULL, updated_at = $2, version = $3 WHERE id = $4 AND deleted_at IS NULL',
            [roleIds.length > 0 ? JSON.stringify(roleIds) : null, Date.now(), nextVersion, entry.id],
          );
        }
      }
      notifySync();
    },

    async deleteStreamEntry(id: string): Promise<void> {
      await deleteTaskFacet(id);
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

    async getBlobData(id: string) {
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT data, mime_type, filename FROM blobs WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        data: coerceBlobBytes(row.data),
        mimeType: String(row.mime_type ?? 'application/octet-stream'),
        filename: String(row.filename ?? ''),
      };
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

    async getAllWindowContexts(): Promise<WindowContext[]> {
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM window_contexts ORDER BY updated_at DESC',
      );
      return rows.map((r) => windowContextFromDbRow(rowToWindowContextDbRow(r)));
    },

    async putWindowContext(ctx: WindowContext): Promise<void> {
      const row = windowContextToDbRow(ctx);
      await db.execute(
        `INSERT INTO window_contexts (
          id, process_name, display_name, title_pattern, match_mode, role_ids, note,
          created_at, updated_at, last_matched_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT(id) DO UPDATE SET
          process_name=excluded.process_name,
          display_name=excluded.display_name,
          title_pattern=excluded.title_pattern,
          match_mode=excluded.match_mode,
          role_ids=excluded.role_ids,
          note=excluded.note,
          created_at=excluded.created_at,
          updated_at=excluded.updated_at,
          last_matched_at=excluded.last_matched_at`,
        [
          row.id,
          row.process_name,
          row.display_name,
          row.title_pattern,
          row.match_mode,
          row.role_ids,
          row.note,
          row.created_at,
          row.updated_at,
          row.last_matched_at,
        ],
      );
    },

    async deleteWindowContext(id: string): Promise<void> {
      await db.execute('DELETE FROM window_contexts WHERE id = $1', [id]);
    },

    async saveThinkSession(session: ThinkSession): Promise<void> {
      const extracted =
        session.extractedActions != null && session.extractedActions.length > 0
          ? JSON.stringify(session.extractedActions)
          : null;
      await db.execute(
        `INSERT INTO think_sessions (id, content, start_mode, extracted_actions, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT(id) DO UPDATE SET
           content=excluded.content,
           start_mode=excluded.start_mode,
           extracted_actions=excluded.extracted_actions,
           updated_at=excluded.updated_at`,
        [
          session.id,
          session.content,
          session.startMode,
          extracted,
          session.createdAt,
          session.updatedAt,
        ],
      );
    },

    async getThinkSession(id: string): Promise<ThinkSession | null> {
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM think_sessions WHERE id = $1',
        [id],
      );
      const r = rows[0];
      return r ? thinkSessionFromRow(r) : null;
    },

    async listThinkSessions(limit = 200): Promise<ThinkSession[]> {
      const lim = Math.min(Math.max(1, limit), 500);
      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT * FROM think_sessions ORDER BY updated_at DESC LIMIT ${lim}`,
      );
      return rows.map(thinkSessionFromRow);
    },

    async deleteThinkSession(id: string): Promise<void> {
      await db.execute('DELETE FROM think_sessions WHERE id = $1', [id]);
    },

    async saveWorkThread(thread: WorkThread): Promise<void> {
      const row = serializeWorkThread(thread);
      await db.execute(
        `INSERT INTO work_threads (
          id, title, mission, status, lane, role_id, doc_markdown, context_items, next_actions,
          resume_card, working_set, waiting_for, interrupts, scheduler_meta, sync_meta, suggestions, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT(id) DO UPDATE SET
          title=excluded.title,
          mission=excluded.mission,
          status=excluded.status,
          lane=excluded.lane,
          role_id=excluded.role_id,
          doc_markdown=excluded.doc_markdown,
          context_items=excluded.context_items,
          next_actions=excluded.next_actions,
          resume_card=excluded.resume_card,
          working_set=excluded.working_set,
          waiting_for=excluded.waiting_for,
          interrupts=excluded.interrupts,
          scheduler_meta=excluded.scheduler_meta,
          sync_meta=excluded.sync_meta,
          suggestions=excluded.suggestions,
          updated_at=excluded.updated_at`,
        [
          row.id,
          row.title,
          row.mission,
          row.status,
          row.lane,
          row.role_id,
          row.doc_markdown,
          row.context_items,
          row.next_actions,
          row.resume_card,
          row.working_set,
          row.waiting_for,
          row.interrupts,
          row.scheduler_meta,
          row.sync_meta,
          row.suggestions,
          row.created_at,
          row.updated_at,
        ],
      );
    },

    async getWorkThread(id: string): Promise<WorkThread | null> {
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM work_threads WHERE id = $1',
        [id],
      );
      const row = rows[0];
      return row ? workThreadFromRow(row) : null;
    },

    async listWorkThreads(limit = 200): Promise<WorkThread[]> {
      const lim = Math.min(Math.max(1, limit), 500);
      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT * FROM work_threads ORDER BY updated_at DESC LIMIT ${lim}`,
      );
      return rows.map(workThreadFromRow);
    },

    async deleteWorkThread(id: string): Promise<void> {
      await db.execute('DELETE FROM work_thread_events WHERE thread_id = $1', [id]);
      await db.execute('DELETE FROM work_threads WHERE id = $1', [id]);
    },

    async appendWorkThreadEvent(event: WorkThreadEvent): Promise<void> {
      await db.execute(
        `INSERT INTO work_thread_events (
          id, thread_id, type, actor, title, detail_markdown, payload, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          event.id,
          event.threadId,
          event.type,
          event.actor,
          event.title,
          event.detailMarkdown ?? null,
          event.payload != null ? JSON.stringify(event.payload) : null,
          event.createdAt,
        ],
      );
    },

    async listWorkThreadEvents(threadId: string, limit = 200): Promise<WorkThreadEvent[]> {
      const lim = Math.min(Math.max(1, limit), 1000);
      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT * FROM work_thread_events WHERE thread_id = $1 ORDER BY created_at DESC LIMIT ${lim}`,
        [threadId],
      );
      return rows.map(workThreadEventFromRow);
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
