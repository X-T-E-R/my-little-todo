/**
 * Local SQLite schema for native clients (Tauri / Capacitor).
 * Tasks and stream entries are first-class tables (not virtual files).
 */

export const SCHEMA_VERSION = 5;

export const CREATE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS schema_version (
    version   INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS version_seq (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_version INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    title_customized INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'inbox',
    body TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,
    ddl INTEGER,
    ddl_type TEXT,
    planned_at INTEGER,
    role_id TEXT,
    role_ids TEXT,
    parent_id TEXT,
    source_stream_id TEXT,
    priority REAL,
    promoted INTEGER,
    phase TEXT,
    kanban_column TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    subtask_ids TEXT NOT NULL DEFAULT '[]',
    resources TEXT NOT NULL DEFAULT '[]',
    reminders TEXT NOT NULL DEFAULT '[]',
    submissions TEXT NOT NULL DEFAULT '[]',
    postponements TEXT NOT NULL DEFAULT '[]',
    status_history TEXT NOT NULL DEFAULT '[]',
    progress_logs TEXT NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS stream_entries (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    entry_type TEXT NOT NULL DEFAULT 'spark',
    timestamp INTEGER NOT NULL,
    date_key TEXT NOT NULL,
    role_id TEXT,
    extracted_task_id TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    attachments TEXT NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    updated_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    version    INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS blobs (
    id         TEXT PRIMARY KEY,
    filename   TEXT NOT NULL,
    mime_type  TEXT NOT NULL,
    size       INTEGER NOT NULL,
    data       BLOB,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    version    INTEGER NOT NULL DEFAULT 0
  )`,
];

export const CREATE_INDEXES_SQL = [
  'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL',
  'CREATE INDEX IF NOT EXISTS idx_tasks_role ON tasks(role_id) WHERE deleted_at IS NULL',
  'CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id) WHERE deleted_at IS NULL',
  'CREATE INDEX IF NOT EXISTS idx_tasks_ddl ON tasks(ddl) WHERE deleted_at IS NULL AND ddl IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS idx_tasks_version ON tasks(version)',
  'CREATE INDEX IF NOT EXISTS idx_stream_date ON stream_entries(date_key) WHERE deleted_at IS NULL',
  'CREATE INDEX IF NOT EXISTS idx_stream_version ON stream_entries(version)',
  'CREATE INDEX IF NOT EXISTS idx_settings_updated ON settings(updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_settings_version ON settings(version)',
  'CREATE INDEX IF NOT EXISTS idx_blobs_deleted ON blobs(deleted_at)',
];
