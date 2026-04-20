/**
 * Local SQLite schema for native clients (Tauri / Capacitor).
 * Tasks and stream entries are first-class tables (not virtual files).
 */

import { LOCAL_DESKTOP_USER_ID } from './localUser';

export const SCHEMA_VERSION = 19;

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
    user_id TEXT NOT NULL DEFAULT '${LOCAL_DESKTOP_USER_ID}',
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
    task_type TEXT,
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
    user_id TEXT NOT NULL DEFAULT '${LOCAL_DESKTOP_USER_ID}',
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    entry_type TEXT NOT NULL DEFAULT 'spark',
    timestamp INTEGER NOT NULL,
    date_key TEXT NOT NULL,
    role_id TEXT,
    extracted_task_id TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    attachments TEXT NOT NULL DEFAULT '[]',
    thread_meta TEXT,
    version INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    updated_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    user_id    TEXT NOT NULL DEFAULT '${LOCAL_DESKTOP_USER_ID}',
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    version    INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS blobs (
    id         TEXT PRIMARY KEY,
    owner      TEXT NOT NULL DEFAULT '${LOCAL_DESKTOP_USER_ID}',
    filename   TEXT NOT NULL,
    mime_type  TEXT NOT NULL,
    size       INTEGER NOT NULL,
    data       BLOB,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    version    INTEGER NOT NULL DEFAULT 0
  )`,

  /** Shared host auth/session tables for desktop embedded host compatibility. */
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    consumed_at TEXT,
    consumed_by TEXT
  )`,

  /** Local-only: 理一理 (Think Session) markdown sessions. */
  `CREATE TABLE IF NOT EXISTS think_sessions (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL DEFAULT '',
    start_mode TEXT NOT NULL DEFAULT 'blank',
    extracted_actions TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  /** Local-only: work threads with structured context + current markdown doc. */
  `CREATE TABLE IF NOT EXISTS work_threads (
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
  )`,

  /** Local-only: work thread milestone timeline. */
  `CREATE TABLE IF NOT EXISTS work_thread_events (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    type TEXT NOT NULL,
    actor TEXT NOT NULL,
    title TEXT NOT NULL,
    detail_markdown TEXT,
    payload TEXT,
    created_at INTEGER NOT NULL
  )`,

  /** Local-only: foreground window → roles + note (Tauri Windows). */
  `CREATE TABLE IF NOT EXISTS window_contexts (
    id               TEXT PRIMARY KEY,
    process_name     TEXT,
    display_name     TEXT,
    title_pattern    TEXT,
    match_mode       TEXT NOT NULL DEFAULT 'contains',
    role_ids         TEXT NOT NULL DEFAULT '[]',
    note             TEXT NOT NULL DEFAULT '',
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL,
    last_matched_at  INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    group_id TEXT,
    user_id TEXT NOT NULL DEFAULT '${LOCAL_DESKTOP_USER_ID}',
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_version INTEGER NOT NULL,
    global_version INTEGER NOT NULL,
    action TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    summary_json TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS entity_revisions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    group_id TEXT,
    user_id TEXT NOT NULL DEFAULT '${LOCAL_DESKTOP_USER_ID}',
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_version INTEGER NOT NULL,
    global_version INTEGER NOT NULL,
    op TEXT NOT NULL,
    changed_at INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL
  )`,
];

export const CREATE_INDEXES_SQL = [
  'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL',
  'CREATE INDEX IF NOT EXISTS idx_tasks_role ON tasks(role_id) WHERE deleted_at IS NULL',
  'CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id) WHERE deleted_at IS NULL',
  'CREATE INDEX IF NOT EXISTS idx_tasks_ddl ON tasks(ddl) WHERE deleted_at IS NULL AND ddl IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS idx_tasks_version ON tasks(version)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id, id)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_user_version ON tasks(user_id, version)',
  'CREATE INDEX IF NOT EXISTS idx_stream_date ON stream_entries(date_key) WHERE deleted_at IS NULL',
  'CREATE INDEX IF NOT EXISTS idx_stream_version ON stream_entries(version)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_user_id ON stream_entries(user_id, id)',
  'CREATE INDEX IF NOT EXISTS idx_stream_user_date ON stream_entries(user_id, date_key)',
  'CREATE INDEX IF NOT EXISTS idx_stream_user_version ON stream_entries(user_id, version)',
  'CREATE INDEX IF NOT EXISTS idx_settings_updated ON settings(updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_settings_version ON settings(version)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user_key ON settings(user_id, key)',
  'CREATE INDEX IF NOT EXISTS idx_settings_user ON settings(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_blobs_deleted ON blobs(deleted_at)',
  'CREATE INDEX IF NOT EXISTS idx_blobs_owner ON blobs(owner)',
  'CREATE INDEX IF NOT EXISTS idx_think_sessions_updated ON think_sessions(updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_work_threads_updated ON work_threads(updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_work_thread_events_thread ON work_thread_events(thread_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_audit_events_user_time ON audit_events(user_id, occurred_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(user_id, entity_type, entity_id, occurred_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_audit_events_source ON audit_events(user_id, source_kind, occurred_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_entity_revisions_event ON entity_revisions(event_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_revisions_user_global ON entity_revisions(user_id, global_version DESC)',
  'CREATE INDEX IF NOT EXISTS idx_entity_revisions_entity ON entity_revisions(user_id, entity_type, entity_id, global_version DESC)',
];
