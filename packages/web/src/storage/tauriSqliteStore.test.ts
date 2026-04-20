import { describe, expect, it } from 'vitest';

import { ensureTauriSqliteSchema } from './tauriSqliteStore';

describe('ensureTauriSqliteSchema', () => {
  it('repairs missing desktop-host columns before creating user-scoped indexes', async () => {
    const statements: string[] = [];

    const db = {
      async execute(statement: string) {
        statements.push(statement);
      },
      async select<T>(statement: string): Promise<T> {
        if (statement.includes('SELECT version FROM schema_version')) {
          return [{ version: 17 }] as T;
        }

        if (statement === 'PRAGMA table_info(tasks)') {
          return [{ name: 'id' }, { name: 'title' }] as T;
        }

        if (statement === 'PRAGMA table_info(stream_entries)') {
          return [{ name: 'id' }, { name: 'content' }] as T;
        }

        if (statement === 'PRAGMA table_info(settings)') {
          return [{ name: 'key' }, { name: 'value' }] as T;
        }

        if (statement === 'PRAGMA table_info(blobs)') {
          return [{ name: 'id' }, { name: 'mime_type' }] as T;
        }

        return [] as T;
      },
    };

    await ensureTauriSqliteSchema(db as never);

    const alterUserIdAt = statements.findIndex((statement) =>
      statement.includes('ALTER TABLE tasks ADD COLUMN user_id'),
    );
    const createUserScopedIndexAt = statements.findIndex((statement) =>
      statement.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_user_id'),
    );

    expect(alterUserIdAt).toBeGreaterThan(-1);
    expect(createUserScopedIndexAt).toBeGreaterThan(alterUserIdAt);
    expect(statements.some((statement) => statement.includes('schema_version'))).toBe(true);
    expect(
      statements.some((statement) => statement.includes('ALTER TABLE audit_events ADD COLUMN group_id')),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('ALTER TABLE entity_revisions ADD COLUMN group_id'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS audit_events')),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('CREATE TABLE IF NOT EXISTS entity_revisions'),
      ),
    ).toBe(true);
  });
});
