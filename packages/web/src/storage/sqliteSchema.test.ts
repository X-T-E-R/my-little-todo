import { describe, expect, it } from 'vitest';

import { LOCAL_DESKTOP_USER_ID } from './localUser';
import { CREATE_INDEXES_SQL, CREATE_TABLES_SQL, SCHEMA_VERSION } from './sqliteSchema';

describe('sqliteSchema desktop host compatibility', () => {
  it('keeps the embedded-host compatibility schema enabled', () => {
    const tables = CREATE_TABLES_SQL.join('\n');
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(17);
    expect(tables).toContain(`user_id TEXT NOT NULL DEFAULT '${LOCAL_DESKTOP_USER_ID}'`);
    expect(tables).toContain(`owner      TEXT NOT NULL DEFAULT '${LOCAL_DESKTOP_USER_ID}'`);
    expect(tables).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(tables).toContain('CREATE TABLE IF NOT EXISTS sessions');
    expect(tables).toContain('CREATE TABLE IF NOT EXISTS invites');
  });

  it('adds user-scoped indexes for shared core tables', () => {
    expect(CREATE_INDEXES_SQL).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id, id)',
    );
    expect(CREATE_INDEXES_SQL).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_user_id ON stream_entries(user_id, id)',
    );
    expect(CREATE_INDEXES_SQL).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user_key ON settings(user_id, key)',
    );
    expect(CREATE_INDEXES_SQL).toContain(
      'CREATE INDEX IF NOT EXISTS idx_blobs_owner ON blobs(owner)',
    );
  });
});
