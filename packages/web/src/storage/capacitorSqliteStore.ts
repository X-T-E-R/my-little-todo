import {
  type StreamEntryDbRow,
  type TaskDbRow,
  formatDateKey,
  streamEntryFromDbRow,
  streamEntryToDbRow,
  taskFromDbRow,
  taskToDbRow,
} from '@my-little-todo/core';
import type {
  StreamEntry,
  Task,
  ThinkSession,
  WindowContext,
  WorkThread,
  WorkThreadEvent,
} from '@my-little-todo/core';
import type { AttachmentConfig, UploadResult } from './blobApi';
import type { DataStore, LocalChangeRecord } from './dataStore';
import { LOCAL_DESKTOP_USER_ID } from './localUser';
import { CREATE_INDEXES_SQL, CREATE_TABLES_SQL, SCHEMA_VERSION } from './sqliteSchema';
import {
  DESKTOP_HOST_COMPATIBILITY_ALTERS,
  DESKTOP_HOST_COMPATIBILITY_COLUMNS,
  findMissingDesktopHostColumns,
  formatDesktopHostCompatibilityRepairMessage,
  needsDesktopHostCompatibilityRepair,
} from './sqliteDesktopHostCompatibility';
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

type CapDB = {
  execute(statement: string, values?: unknown[]): Promise<{ changes?: { changes?: number } }>;
  query(statement: string, values?: unknown[]): Promise<{ values?: Record<string, unknown>[] }>;
};

async function getTableColumns(
  db: CapDB,
  table: keyof typeof DESKTOP_HOST_COMPATIBILITY_COLUMNS,
): Promise<string[]> {
  const rows = await db.query(`PRAGMA table_info(${table})`);
  return (rows.values ?? [])
    .map((row) => (row.name != null ? String(row.name).trim() : ''))
    .filter((column) => column.length > 0);
}

async function getMissingDesktopHostColumns(db: CapDB): Promise<string[]> {
  const columnsByTable = Object.create(null) as Record<
    keyof typeof DESKTOP_HOST_COMPATIBILITY_COLUMNS,
    string[]
  >;

  for (const table of Object.keys(DESKTOP_HOST_COMPATIBILITY_COLUMNS) as Array<
    keyof typeof DESKTOP_HOST_COMPATIBILITY_COLUMNS
  >) {
    columnsByTable[table] = await getTableColumns(db, table);
  }

  return findMissingDesktopHostColumns(columnsByTable);
}

async function applyDesktopHostCompatibilityMigration(db: CapDB): Promise<void> {
  for (const sql of DESKTOP_HOST_COMPATIBILITY_ALTERS) {
    try {
      await db.execute(sql);
    } catch {
      /* column may already exist */
    }
  }

  await db.execute('UPDATE tasks SET user_id = ? WHERE trim(COALESCE(user_id, \'\')) = \'\'', [
    LOCAL_DESKTOP_USER_ID,
  ]);
  await db.execute(
    'UPDATE stream_entries SET user_id = ? WHERE trim(COALESCE(user_id, \'\')) = \'\'',
    [LOCAL_DESKTOP_USER_ID],
  );
  await db.execute('UPDATE settings SET user_id = ? WHERE trim(COALESCE(user_id, \'\')) = \'\'', [
    LOCAL_DESKTOP_USER_ID,
  ]);
  await db.execute('UPDATE blobs SET owner = ? WHERE trim(COALESCE(owner, \'\')) = \'\'', [
    LOCAL_DESKTOP_USER_ID,
  ]);

  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  try {
    await db.execute('ALTER TABLE users ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1');
  } catch {
    /* column may already exist */
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    consumed_at TEXT,
    consumed_by TEXT
  )`);
}

function coerceBlobBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value.map((item) => Number(item) || 0));
  return new Uint8Array();
}

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

  await db.execute('INSERT OR IGNORE INTO version_seq (id, current_version) VALUES (1, 0)');

  const rows = await db.query('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
  if (!rows.values || rows.values.length === 0) {
    await db.execute(
      `INSERT INTO schema_version (version, applied_at) VALUES (${SCHEMA_VERSION}, ${Date.now()})`,
    );
    const missingDesktopHostColumns = await getMissingDesktopHostColumns(db);
    if (missingDesktopHostColumns.length > 0) {
      console.warn(formatDesktopHostCompatibilityRepairMessage(0, missingDesktopHostColumns));
      await applyDesktopHostCompatibilityMigration(db);
    }
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
    const rows2 = await db.query(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
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
    const rows3 = await db.query(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
    const ver3 = rows3.values?.[0]?.version != null ? Number(rows3.values[0].version) : 0;
    if (ver3 < 5) {
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
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (5, ${Date.now()})`,
      );
    }
    const rowsV7 = await db.query(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
    const verBefore7 = rowsV7.values?.[0]?.version != null ? Number(rowsV7.values[0].version) : 0;
    if (verBefore7 < 7) {
      await db.execute(
        'UPDATE tasks SET title_customized = 1 WHERE length(trim(title)) > 0 AND title_customized = 0',
      );
      await db.execute(
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (7, ${Date.now()})`,
      );
    }
    const rowsV8 = await db.query(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
    const verBefore9 = rowsV8.values?.[0]?.version != null ? Number(rowsV8.values[0].version) : 0;
    if (verBefore9 < 9) {
      try {
        await db.execute('ALTER TABLE tasks ADD COLUMN task_type TEXT');
      } catch {
        /* column may already exist */
      }
      await db.execute(
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (9, ${Date.now()})`,
      );
    }
    const rowsV9 = await db.query(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
    const verBefore10 = rowsV9.values?.[0]?.version != null ? Number(rowsV9.values[0].version) : 0;
    if (verBefore10 < 10) {
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
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (10, ${Date.now()})`,
      );
    }
    const rowsV10 = await db.query(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
    const verBefore11 =
      rowsV10.values?.[0]?.version != null ? Number(rowsV10.values[0].version) : 0;
    if (verBefore11 < 11) {
      await db.execute(`CREATE TABLE IF NOT EXISTS work_threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        mission TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'ready',
        lane TEXT NOT NULL DEFAULT 'general',
        role_id TEXT,
        root_markdown TEXT NOT NULL DEFAULT '',
        exploration_markdown TEXT NOT NULL DEFAULT '',
        doc_markdown TEXT NOT NULL DEFAULT '',
        context_items TEXT NOT NULL DEFAULT '[]',
        intents TEXT NOT NULL DEFAULT '[]',
        spark_containers TEXT NOT NULL DEFAULT '[]',
        next_actions TEXT NOT NULL DEFAULT '[]',
        resume_card TEXT NOT NULL DEFAULT '{}',
        working_set TEXT NOT NULL DEFAULT '[]',
        waiting_for TEXT NOT NULL DEFAULT '[]',
        interrupts TEXT NOT NULL DEFAULT '[]',
        exploration_blocks TEXT NOT NULL DEFAULT '[]',
        inline_anchors TEXT NOT NULL DEFAULT '[]',
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
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (11, ${Date.now()})`,
      );
    }
    const rowsV11 = await db.query(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
    const verBefore12 =
      rowsV11.values?.[0]?.version != null ? Number(rowsV11.values[0].version) : 0;
    if (verBefore12 < 12) {
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
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (12, ${Date.now()})`,
      );
    }
    const rowsV12 = await db.query(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
    const verBefore13 =
      rowsV12.values?.[0]?.version != null ? Number(rowsV12.values[0].version) : 0;
    if (verBefore13 < 13) {
      try {
        await db.execute(
          `ALTER TABLE work_threads ADD COLUMN sync_meta TEXT NOT NULL DEFAULT '{"mode":"internal"}'`,
        );
      } catch {
        /* column may already exist */
      }
      await db.execute(
        `UPDATE work_threads SET sync_meta = '{"mode":"internal"}' WHERE trim(COALESCE(sync_meta, '')) = ''`,
      );
      await db.execute(
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (13, ${Date.now()})`,
      );
    }
    const rowsV13 = await db.query(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
    const verBefore14 =
      rowsV13.values?.[0]?.version != null ? Number(rowsV13.values[0].version) : 0;
    if (verBefore14 < 14) {
      const alterColumns = [
        'ALTER TABLE stream_entries ADD COLUMN thread_meta TEXT',
        "ALTER TABLE work_threads ADD COLUMN exploration_blocks TEXT NOT NULL DEFAULT '[]'",
      ];
      for (const sql of alterColumns) {
        try {
          await db.execute(sql);
        } catch {
          /* column may already exist */
        }
      }
      await db.execute(
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (14, ${Date.now()})`,
      );
    }
    const rowsV14 = await db.query(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
    const verBefore15 =
      rowsV14.values?.[0]?.version != null ? Number(rowsV14.values[0].version) : 0;
    if (verBefore15 < 15) {
      const alterColumns = [
        "ALTER TABLE work_threads ADD COLUMN intents TEXT NOT NULL DEFAULT '[]'",
        "ALTER TABLE work_threads ADD COLUMN inline_anchors TEXT NOT NULL DEFAULT '[]'",
      ];
      for (const sql of alterColumns) {
        try {
          await db.execute(sql);
        } catch {
          /* column may already exist */
        }
      }
      await db.execute(
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (15, ${Date.now()})`,
      );
    }
    const rowsV15 = await db.query(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
    const verBefore16 =
      rowsV15.values?.[0]?.version != null ? Number(rowsV15.values[0].version) : 0;
    if (verBefore16 < 16) {
      const alterColumns = [
        "ALTER TABLE work_threads ADD COLUMN root_markdown TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE work_threads ADD COLUMN exploration_markdown TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE work_threads ADD COLUMN spark_containers TEXT NOT NULL DEFAULT '[]'",
      ];
      for (const sql of alterColumns) {
        try {
          await db.execute(sql);
        } catch {
          /* column may already exist */
        }
      }
      await db.execute(
        "UPDATE work_threads SET root_markdown = doc_markdown WHERE trim(COALESCE(root_markdown, '')) = ''",
      );
      await db.execute(
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (16, ${Date.now()})`,
      );
    }
    const rowsV16 = await db.query(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
    const verBefore17 =
      rowsV16.values?.[0]?.version != null ? Number(rowsV16.values[0].version) : 0;
    const missingDesktopHostColumns = await getMissingDesktopHostColumns(db);
    if (needsDesktopHostCompatibilityRepair(verBefore17, missingDesktopHostColumns)) {
      if (missingDesktopHostColumns.length > 0) {
        console.warn(
          formatDesktopHostCompatibilityRepairMessage(verBefore17, missingDesktopHostColumns),
        );
      }
      await applyDesktopHostCompatibilityMigration(db);
      await db.execute(
        `INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (17, ${Date.now()})`,
      );
    }
  }

  for (const sql of CREATE_INDEXES_SQL) {
    await db.execute(sql);
  }
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
    thread_meta: r.thread_meta != null ? String(r.thread_meta) : null,
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

export async function createCapacitorSqliteDataStore(): Promise<DataStore> {
  const db = await openCapacitorDb();
  await ensureSchema(db);

  const now = () => Date.now();
  const deleteTaskFacet = async (id: string): Promise<void> => {
    const ts = now();
    const v = await bumpVersion(db);
    await db.execute(
      'UPDATE tasks SET deleted_at = ?, updated_at = ?, version = ? WHERE user_id = ? AND id = ? AND deleted_at IS NULL',
      [ts, ts, v, LOCAL_DESKTOP_USER_ID, id],
    );
  };

  return {
    async getAllTasks(): Promise<Task[]> {
      const [taskRows, streamRows] = await Promise.all([
        db.query('SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC', [
          LOCAL_DESKTOP_USER_ID,
        ]),
        db.query('SELECT * FROM stream_entries WHERE user_id = ? AND deleted_at IS NULL', [
          LOCAL_DESKTOP_USER_ID,
        ]),
      ]);
      if (!taskRows.values) return [];
      const taskDbRows = taskRows.values.map((r) => rowToTaskDbRow(r));
      const streamRowsById = new Map(
        (streamRows.values ?? []).map((r) => {
          const row = rowToStreamDbRow(r);
          return [row.id, row] as const;
        }),
      );
      return taskDbRows.map((row) => taskFromJoinedRows(row, streamRowsById));
    },

    async getTask(id: string): Promise<Task | null> {
      const rows = await db.query('SELECT * FROM tasks WHERE user_id = ? AND id = ? AND deleted_at IS NULL', [
        LOCAL_DESKTOP_USER_ID,
        id,
      ]);
      if (!rows.values?.length) return null;
      const taskRow = rowToTaskDbRow(rows.values[0]);
      const streamIds = [...new Set([taskRow.id, resolvedStreamEntryId(taskRow)])];
      const placeholders = streamIds.map(() => '?').join(', ');
      const streamRows = await db.query(
        `SELECT * FROM stream_entries WHERE user_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
        [LOCAL_DESKTOP_USER_ID, ...streamIds],
      );
      const streamRowsById = new Map(
        (streamRows.values ?? []).map((r) => {
          const row = rowToStreamDbRow(r);
          return [row.id, row] as const;
        }),
      );
      return taskFromJoinedRows(taskRow, streamRowsById);
    },

    async putTask(task: Task): Promise<void> {
      const existingStreamRows = await db.query(
        'SELECT * FROM stream_entries WHERE user_id = ? AND id = ? AND deleted_at IS NULL',
        [LOCAL_DESKTOP_USER_ID, task.id],
      );
      const existingStream = existingStreamRows.values?.[0]
        ? streamEntryFromDbRow(rowToStreamDbRow(existingStreamRows.values[0]))
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
          user_id, id, content, entry_type, timestamp, date_key, role_id, extracted_task_id,
          tags, attachments, thread_meta, version, deleted_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id, id) DO UPDATE SET
          content=excluded.content, entry_type=excluded.entry_type, timestamp=excluded.timestamp,
          date_key=excluded.date_key, role_id=excluded.role_id, extracted_task_id=excluded.extracted_task_id,
          tags=excluded.tags, attachments=excluded.attachments, thread_meta=excluded.thread_meta, version=excluded.version, deleted_at=excluded.deleted_at,
          updated_at=excluded.updated_at`,
        [
          LOCAL_DESKTOP_USER_ID,
          streamRow.id,
          streamRow.content,
          streamRow.entry_type,
          streamRow.timestamp,
          streamRow.date_key,
          streamRow.role_id,
          null,
          streamRow.tags,
          streamRow.attachments,
          streamRow.thread_meta ?? null,
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
          user_id, id, title, title_customized, description, status, body, created_at, updated_at, completed_at,
          ddl, ddl_type, planned_at, role_id, role_ids, parent_id, source_stream_id, priority, promoted, phase, kanban_column,
          task_type,
          tags, subtask_ids, resources, reminders, submissions, postponements, status_history, progress_logs,
          version, deleted_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id, id) DO UPDATE SET
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
          LOCAL_DESKTOP_USER_ID,
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
    },

    async deleteTask(id: string): Promise<void> {
      await deleteTaskFacet(id);
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        'UPDATE stream_entries SET deleted_at = ?, version = ? WHERE user_id = ? AND id = ? AND deleted_at IS NULL',
        [ts, v, LOCAL_DESKTOP_USER_ID, id],
      );
    },

    deleteTaskFacet,

    async getStreamDay(dateKey: string): Promise<StreamEntry[]> {
      const [rows, taskRows] = await Promise.all([
        db.query(
          'SELECT * FROM stream_entries WHERE user_id = ? AND date_key = ? AND deleted_at IS NULL ORDER BY timestamp ASC',
          [LOCAL_DESKTOP_USER_ID, dateKey],
        ),
        db.query('SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL', [
          LOCAL_DESKTOP_USER_ID,
        ]),
      ]);
      if (!rows.values) return [];
      return streamEntriesWithTaskLinks(
        rows.values,
        (taskRows.values ?? []).map((r) => rowToTaskDbRow(r)),
      );
    },

    async getRecentStream(days = 14): Promise<StreamEntry[]> {
      const min = new Date();
      min.setDate(min.getDate() - days);
      const minKey = formatDateKey(min);
      const [rows, taskRows] = await Promise.all([
        db.query(
          'SELECT * FROM stream_entries WHERE user_id = ? AND deleted_at IS NULL AND date_key >= ? ORDER BY timestamp DESC',
          [LOCAL_DESKTOP_USER_ID, minKey],
        ),
        db.query('SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL', [
          LOCAL_DESKTOP_USER_ID,
        ]),
      ]);
      if (!rows.values) return [];
      return streamEntriesWithTaskLinks(
        rows.values,
        (taskRows.values ?? []).map((r) => rowToTaskDbRow(r)),
      );
    },

    async listStreamDateKeys(): Promise<string[]> {
      const rows = await db.query(
        'SELECT DISTINCT date_key FROM stream_entries WHERE user_id = ? AND deleted_at IS NULL ORDER BY date_key DESC',
        [LOCAL_DESKTOP_USER_ID],
      );
      if (!rows.values) return [];
      return rows.values.map((r) => String(r.date_key));
    },

    async searchStreamEntries(query: string, limit = 200): Promise<StreamEntry[]> {
      const needle = query.trim();
      if (!needle) return [];
      const lim = Math.min(Math.max(1, limit), 500);
      const [rows, taskRows] = await Promise.all([
        db.query(
          'SELECT * FROM stream_entries WHERE user_id = ? AND deleted_at IS NULL AND instr(lower(content), lower(?)) > 0 ORDER BY timestamp DESC LIMIT ?',
          [LOCAL_DESKTOP_USER_ID, needle, lim],
        ),
        db.query('SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL', [
          LOCAL_DESKTOP_USER_ID,
        ]),
      ]);
      if (!rows.values) return [];
      return streamEntriesWithTaskLinks(
        rows.values,
        (taskRows.values ?? []).map((r) => rowToTaskDbRow(r)),
      );
    },

    async putStreamEntry(entry: StreamEntry): Promise<void> {
      const v = await bumpVersion(db);
      const row = streamEntryToDbRow(entry, v, null);
      await db.execute(
        `INSERT INTO stream_entries (
          user_id, id, content, entry_type, timestamp, date_key, role_id, extracted_task_id,
          tags, attachments, thread_meta, version, deleted_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id, id) DO UPDATE SET
          content=excluded.content, entry_type=excluded.entry_type, timestamp=excluded.timestamp,
          date_key=excluded.date_key, role_id=excluded.role_id, extracted_task_id=excluded.extracted_task_id,
          tags=excluded.tags, attachments=excluded.attachments, thread_meta=excluded.thread_meta, version=excluded.version, deleted_at=excluded.deleted_at,
          updated_at=excluded.updated_at`,
        [
          LOCAL_DESKTOP_USER_ID,
          row.id,
          row.content,
          row.entry_type,
          row.timestamp,
          row.date_key,
          row.role_id,
          null,
          row.tags,
          row.attachments,
          row.thread_meta ?? null,
          row.version,
          row.deleted_at,
          row.updated_at ?? row.timestamp,
        ],
      );
      const linkedTaskRows = await db.query(
        'SELECT * FROM tasks WHERE user_id = ? AND id = ? AND deleted_at IS NULL',
        [LOCAL_DESKTOP_USER_ID, entry.id],
      );
      const linkedTaskRaw = linkedTaskRows.values?.[0];
      if (linkedTaskRaw) {
        const linkedTask = taskFromDbRow(rowToTaskDbRow(linkedTaskRaw));
        if (shouldProjectStreamRoleToTask(linkedTask)) {
          const roleIds = normalizeTaskRoleIds(linkedTask, entry.roleId);
          const nextVersion = await bumpVersion(db);
          await db.execute(
            'UPDATE tasks SET role_ids = ?, role_id = NULL, updated_at = ?, version = ? WHERE user_id = ? AND id = ? AND deleted_at IS NULL',
            [
              roleIds.length > 0 ? JSON.stringify(roleIds) : null,
              Date.now(),
              nextVersion,
              LOCAL_DESKTOP_USER_ID,
              entry.id,
            ],
          );
        }
      }
    },

    async deleteStreamEntry(id: string): Promise<void> {
      await deleteTaskFacet(id);
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        'UPDATE stream_entries SET deleted_at = ?, version = ? WHERE user_id = ? AND id = ? AND deleted_at IS NULL',
        [ts, v, LOCAL_DESKTOP_USER_ID, id],
      );
    },

    async getSetting(key: string): Promise<string | null> {
      const rows = await db.query(
        'SELECT value FROM settings WHERE user_id = ? AND key = ? AND deleted_at IS NULL',
        [LOCAL_DESKTOP_USER_ID, key],
      );
      return rows.values?.length ? (rows.values[0].value as string) : null;
    },

    async putSetting(key: string, value: string): Promise<void> {
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        `INSERT INTO settings (user_id, key, value, updated_at, version, deleted_at)
         VALUES (?, ?, ?, ?, ?, NULL)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, version = excluded.version, deleted_at = NULL`,
        [LOCAL_DESKTOP_USER_ID, key, value, ts, v],
      );
    },

    async deleteSetting(key: string): Promise<void> {
      const ts = now();
      const v = await bumpVersion(db);
      await db.execute(
        'UPDATE settings SET deleted_at = ?, updated_at = ?, version = ? WHERE user_id = ? AND key = ? AND deleted_at IS NULL',
        [ts, ts, v, LOCAL_DESKTOP_USER_ID, key],
      );
    },

    async getAllSettings(): Promise<Record<string, string>> {
      const rows = await db.query('SELECT key, value FROM settings WHERE user_id = ? AND deleted_at IS NULL', [
        LOCAL_DESKTOP_USER_ID,
      ]);
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
        `INSERT INTO blobs (id, owner, filename, mime_type, size, data, created_at, deleted_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [
          id,
          LOCAL_DESKTOP_USER_ID,
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

    async getBlobData(id: string) {
      const rows = await db.query(
        'SELECT data, mime_type, filename FROM blobs WHERE owner = ? AND id = ? AND deleted_at IS NULL LIMIT 1',
        [LOCAL_DESKTOP_USER_ID, id],
      );
      const row = rows.values?.[0];
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
        'UPDATE blobs SET deleted_at = ?, version = ? WHERE owner = ? AND id = ? AND deleted_at IS NULL',
        [ts, v, LOCAL_DESKTOP_USER_ID, id],
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

    async getAllWindowContexts(): Promise<WindowContext[]> {
      return [];
    },

    async putWindowContext(_ctx: WindowContext): Promise<void> {
      /* Capacitor: not implemented */
    },

    async deleteWindowContext(_id: string): Promise<void> {
      /* Capacitor: not implemented */
    },

    async saveThinkSession(session: ThinkSession): Promise<void> {
      const extracted =
        session.extractedActions != null && session.extractedActions.length > 0
          ? JSON.stringify(session.extractedActions)
          : null;
      await db.execute(
        `INSERT INTO think_sessions (id, content, start_mode, extracted_actions, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
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
      const rows = await db.query('SELECT * FROM think_sessions WHERE id = ?', [id]);
      const r = rows.values?.[0];
      return r ? thinkSessionFromRow(r as Record<string, unknown>) : null;
    },

    async listThinkSessions(limit = 200): Promise<ThinkSession[]> {
      const lim = Math.min(Math.max(1, limit), 500);
      const rows = await db.query(
        `SELECT * FROM think_sessions ORDER BY updated_at DESC LIMIT ${lim}`,
      );
      if (!rows.values) return [];
      return rows.values.map((r) => thinkSessionFromRow(r as Record<string, unknown>));
    },

    async deleteThinkSession(id: string): Promise<void> {
      await db.execute('DELETE FROM think_sessions WHERE id = ?', [id]);
    },

    async saveWorkThread(thread: WorkThread): Promise<void> {
      const row = serializeWorkThread(thread);
      await db.execute(
        `INSERT INTO work_threads (
          id, title, mission, status, lane, role_id, root_markdown, exploration_markdown, doc_markdown, context_items, intents, spark_containers, next_actions,
          resume_card, working_set, waiting_for, interrupts, exploration_blocks, inline_anchors, scheduler_meta, sync_meta, suggestions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title=excluded.title,
          mission=excluded.mission,
          status=excluded.status,
          lane=excluded.lane,
          role_id=excluded.role_id,
          root_markdown=excluded.root_markdown,
          exploration_markdown=excluded.exploration_markdown,
          doc_markdown=excluded.doc_markdown,
          context_items=excluded.context_items,
          intents=excluded.intents,
          spark_containers=excluded.spark_containers,
          next_actions=excluded.next_actions,
          resume_card=excluded.resume_card,
          working_set=excluded.working_set,
          waiting_for=excluded.waiting_for,
          interrupts=excluded.interrupts,
          exploration_blocks=excluded.exploration_blocks,
          inline_anchors=excluded.inline_anchors,
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
          row.root_markdown,
          row.exploration_markdown,
          row.doc_markdown,
          row.context_items,
          row.intents,
          row.spark_containers,
          row.next_actions,
          row.resume_card,
          row.working_set,
          row.waiting_for,
          row.interrupts,
          row.exploration_blocks,
          row.inline_anchors,
          row.scheduler_meta,
          row.sync_meta,
          row.suggestions,
          row.created_at,
          row.updated_at,
        ],
      );
    },

    async getWorkThread(id: string): Promise<WorkThread | null> {
      const rows = await db.query('SELECT * FROM work_threads WHERE id = ?', [id]);
      const row = rows.values?.[0];
      return row ? workThreadFromRow(row as Record<string, unknown>) : null;
    },

    async listWorkThreads(limit = 200): Promise<WorkThread[]> {
      const lim = Math.min(Math.max(1, limit), 500);
      const rows = await db.query(
        `SELECT * FROM work_threads ORDER BY updated_at DESC LIMIT ${lim}`,
      );
      if (!rows.values) return [];
      return rows.values.map((r) => workThreadFromRow(r as Record<string, unknown>));
    },

    async deleteWorkThread(id: string): Promise<void> {
      await db.execute('DELETE FROM work_thread_events WHERE thread_id = ?', [id]);
      await db.execute('DELETE FROM work_threads WHERE id = ?', [id]);
    },

    async appendWorkThreadEvent(event: WorkThreadEvent): Promise<void> {
      await db.execute(
        `INSERT INTO work_thread_events (
          id, thread_id, type, actor, title, detail_markdown, payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
      const rows = await db.query(
        `SELECT * FROM work_thread_events WHERE thread_id = ? ORDER BY created_at DESC LIMIT ${lim}`,
        [threadId],
      );
      if (!rows.values) return [];
      return rows.values.map((r) => workThreadEventFromRow(r as Record<string, unknown>));
    },

    async getMaxVersion(): Promise<number> {
      const rows = await db.query('SELECT current_version as c FROM version_seq WHERE id = 1');
      return rows.values?.[0]?.c != null ? Number(rows.values[0].c) : 0;
    },

    async getChangesSince(sinceVersion: number): Promise<LocalChangeRecord[]> {
      const out: LocalChangeRecord[] = [];

      const taskRows = await db.query('SELECT * FROM tasks WHERE user_id = ? AND version > ?', [
        LOCAL_DESKTOP_USER_ID,
        sinceVersion,
      ]);
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

      const streamRows = await db.query(
        'SELECT * FROM stream_entries WHERE user_id = ? AND version > ?',
        [LOCAL_DESKTOP_USER_ID, sinceVersion],
      );
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
        "SELECT key, value, updated_at, version, deleted_at FROM settings WHERE user_id = ? AND version > ? AND key NOT LIKE '__sync_%'",
        [LOCAL_DESKTOP_USER_ID, sinceVersion],
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
        'SELECT id, filename, mime_type, size, created_at, version, deleted_at FROM blobs WHERE owner = ? AND version > ?',
        [LOCAL_DESKTOP_USER_ID, sinceVersion],
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
