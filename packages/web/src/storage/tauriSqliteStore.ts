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

  const rows = await db.select<{ version: number }[]>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
  );
  if (rows.length === 0) {
    await db.execute('INSERT INTO schema_version (version, applied_at) VALUES ($1, $2)', [
      SCHEMA_VERSION,
      Date.now(),
    ]);
  }
}

export async function createTauriSqliteDataStore(): Promise<DataStore> {
  const db = await getDb();
  await ensureSchema(db);

  const now = () => Date.now();

  return {
    // ── Files ──────────────────────────────────────────────────────

    async readFile(...segments: string[]): Promise<string | null> {
      const path = segments.join('/');
      const rows = await db.select<{ content: string }[]>(
        'SELECT content FROM files WHERE path = $1 AND deleted_at IS NULL',
        [path],
      );
      return rows.length > 0 ? rows[0].content : null;
    },

    async writeFile(content: string, ...segments: string[]): Promise<void> {
      const path = segments.join('/');
      const ts = now();
      await db.execute(
        `INSERT INTO files (path, content, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, NULL)
         ON CONFLICT(path) DO UPDATE SET content = $2, updated_at = $4, deleted_at = NULL`,
        [path, content, ts, ts],
      );
      notifySync();
    },

    async deleteFile(...segments: string[]): Promise<void> {
      const path = segments.join('/');
      await db.execute(
        'UPDATE files SET deleted_at = $1, updated_at = $1 WHERE path = $2 AND deleted_at IS NULL',
        [now(), path],
      );
      notifySync();
    },

    async listFiles(...segments: string[]): Promise<string[]> {
      const dir = segments.join('/');
      const prefix = dir ? `${dir}/` : '';
      const rows = await db.select<{ path: string }[]>(
        `SELECT path FROM files
         WHERE path LIKE $1 AND deleted_at IS NULL
         AND path NOT LIKE $2`,
        [`${prefix}%`, `${prefix}%/%`],
      );
      return rows.map((r) => {
        const name = r.path.slice(prefix.length);
        return name;
      });
    },

    async listAllFiles(): Promise<string[]> {
      const rows = await db.select<{ path: string }[]>(
        'SELECT path FROM files WHERE deleted_at IS NULL ORDER BY path',
      );
      return rows.map((r) => r.path);
    },

    // ── Settings ───────────────────────────────────────────────────

    async getSetting(key: string): Promise<string | null> {
      const rows = await db.select<{ value: string }[]>(
        'SELECT value FROM settings WHERE key = $1 AND deleted_at IS NULL',
        [key],
      );
      return rows.length > 0 ? rows[0].value : null;
    },

    async putSetting(key: string, value: string): Promise<void> {
      const ts = now();
      await db.execute(
        `INSERT INTO settings (key, value, updated_at, deleted_at)
         VALUES ($1, $2, $3, NULL)
         ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = $3, deleted_at = NULL`,
        [key, value, ts],
      );
      if (!key.startsWith('__sync_') && !key.startsWith('sync-')) notifySync();
    },

    async deleteSetting(key: string): Promise<void> {
      await db.execute(
        'UPDATE settings SET deleted_at = $1, updated_at = $1 WHERE key = $2 AND deleted_at IS NULL',
        [now(), key],
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

    // ── Blobs ──────────────────────────────────────────────────────

    async uploadBlob(file: File): Promise<UploadResult> {
      const id = crypto.randomUUID();
      const buffer = await file.arrayBuffer();
      const ts = now();
      await db.execute(
        `INSERT INTO blobs (id, filename, mime_type, size, data, created_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
        [
          id,
          file.name,
          file.type || 'application/octet-stream',
          file.size,
          Array.from(new Uint8Array(buffer)),
          ts,
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
      await db.execute('UPDATE blobs SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL', [
        now(),
        id,
      ]);
    },

    async getAttachmentConfig(): Promise<AttachmentConfig> {
      return {
        allow_attachments: true,
        max_size: 50 * 1024 * 1024,
        storage: 'local',
        image_host_url: '',
      };
    },

    async getChangesSince(sinceTimestamp: number): Promise<LocalChangeRecord[]> {
      const fileRows = await db.select<
        { path: string; content: string; updated_at: number; deleted_at: number | null }[]
      >('SELECT path, content, updated_at, deleted_at FROM files WHERE updated_at > $1', [
        sinceTimestamp,
      ]);
      const settingRows = await db.select<
        { key: string; value: string; updated_at: number; deleted_at: number | null }[]
      >(
        "SELECT key, value, updated_at, deleted_at FROM settings WHERE updated_at > $1 AND key NOT LIKE '__sync_%'",
        [sinceTimestamp],
      );
      const results: LocalChangeRecord[] = [];
      for (const r of fileRows) {
        results.push({
          table: 'files',
          key: r.path,
          content: r.deleted_at ? null : r.content,
          updatedAt: r.updated_at,
          deletedAt: r.deleted_at,
        });
      }
      for (const r of settingRows) {
        results.push({
          table: 'settings',
          key: r.key,
          content: r.deleted_at ? null : r.value,
          updatedAt: r.updated_at,
          deletedAt: r.deleted_at,
        });
      }
      return results;
    },
  };
}
