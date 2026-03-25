/**
 * Local SQLite schema for native clients (Tauri / Capacitor).
 * All tables support soft delete via `deleted_at` and change tracking
 * via `updated_at` for sync purposes.
 */

export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS schema_version (
    version   INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS files (
    path       TEXT PRIMARY KEY,
    content    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS blobs (
    id         TEXT PRIMARY KEY,
    filename   TEXT NOT NULL,
    mime_type  TEXT NOT NULL,
    size       INTEGER NOT NULL,
    data       BLOB,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS sync_meta (
    target_id   TEXT PRIMARY KEY,
    target_type TEXT NOT NULL,
    last_push_at INTEGER NOT NULL DEFAULT 0,
    last_pull_at INTEGER NOT NULL DEFAULT 0,
    config_json  TEXT
  )`,
];

export const CREATE_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_files_updated ON files(updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_files_deleted ON files(deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_settings_updated ON settings(updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_blobs_deleted ON blobs(deleted_at)`,
];
