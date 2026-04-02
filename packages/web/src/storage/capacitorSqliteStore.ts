import type { AttachmentConfig, UploadResult } from './blobApi';
import type { DataStore } from './dataStore';
import { CREATE_INDEXES_SQL, CREATE_TABLES_SQL, SCHEMA_VERSION } from './sqliteSchema';

/**
 * DataStore implementation for Capacitor (Android/iOS) using
 * @capacitor-community/sqlite. Uses the same SQLite schema as the
 * Tauri implementation (sqliteSchema.ts).
 *
 * This is loaded only on Capacitor platforms via dynamic import.
 */

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

  const rows = await db.query('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
  if (!rows.values || rows.values.length === 0) {
    await db.execute(
      `INSERT INTO schema_version (version, applied_at) VALUES (${SCHEMA_VERSION}, ${Date.now()})`,
    );
  }
}

export async function createCapacitorSqliteDataStore(): Promise<DataStore> {
  const db = await openCapacitorDb();
  await ensureSchema(db);

  const now = () => Date.now();

  return {
    async readFile(...segments: string[]): Promise<string | null> {
      const path = segments.join('/');
      const rows = await db.query(
        `SELECT content FROM files WHERE path = '${path}' AND deleted_at IS NULL`,
      );
      return rows.values && rows.values.length > 0 ? (rows.values[0].content as string) : null;
    },

    async writeFile(content: string, ...segments: string[]): Promise<void> {
      const path = segments.join('/');
      const ts = now();
      await db.execute(
        `INSERT INTO files (path, content, created_at, updated_at, deleted_at)
         VALUES ('${path}', '${content.replace(/'/g, "''")}', ${ts}, ${ts}, NULL)
         ON CONFLICT(path) DO UPDATE SET
           content = '${content.replace(/'/g, "''")}',
           updated_at = ${ts},
           deleted_at = NULL`,
      );
    },

    async deleteFile(...segments: string[]): Promise<void> {
      const path = segments.join('/');
      const ts = now();
      await db.execute(
        `UPDATE files SET deleted_at = ${ts}, updated_at = ${ts}
         WHERE path = '${path}' AND deleted_at IS NULL`,
      );
    },

    async listFiles(...segments: string[]): Promise<string[]> {
      const dir = segments.join('/');
      const prefix = dir ? `${dir}/` : '';
      const rows = await db.query(
        `SELECT path FROM files
         WHERE path LIKE '${prefix}%' AND path NOT LIKE '${prefix}%/%' AND deleted_at IS NULL`,
      );
      if (!rows.values) return [];
      return rows.values.map((r) => {
        const fullPath = r.path as string;
        return fullPath.slice(prefix.length);
      });
    },

    async listAllFiles(): Promise<string[]> {
      const rows = await db.query(
        'SELECT path FROM files WHERE deleted_at IS NULL ORDER BY path',
      );
      if (!rows.values) return [];
      return rows.values.map((r) => r.path as string);
    },

    async getSetting(key: string): Promise<string | null> {
      const rows = await db.query(
        `SELECT value FROM settings WHERE key = '${key}' AND deleted_at IS NULL`,
      );
      return rows.values && rows.values.length > 0 ? (rows.values[0].value as string) : null;
    },

    async putSetting(key: string, value: string): Promise<void> {
      const ts = now();
      await db.execute(
        `INSERT INTO settings (key, value, updated_at, deleted_at)
         VALUES ('${key}', '${value.replace(/'/g, "''")}', ${ts}, NULL)
         ON CONFLICT(key) DO UPDATE SET
           value = '${value.replace(/'/g, "''")}',
           updated_at = ${ts},
           deleted_at = NULL`,
      );
    },

    async deleteSetting(key: string): Promise<void> {
      const ts = now();
      await db.execute(
        `UPDATE settings SET deleted_at = ${ts}, updated_at = ${ts}
         WHERE key = '${key}' AND deleted_at IS NULL`,
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
      const ts = now();
      await db.execute(
        `INSERT INTO blobs (id, filename, mime_type, size, data, created_at, deleted_at)
         VALUES ('${id}', '${file.name.replace(/'/g, "''")}', '${file.type || 'application/octet-stream'}', ${file.size}, NULL, ${ts}, NULL)`,
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
      await db.execute(
        `UPDATE blobs SET deleted_at = ${ts} WHERE id = '${id}' AND deleted_at IS NULL`,
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
  };
}
