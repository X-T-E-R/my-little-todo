/**
 * One-time migration from the old embedded-server SQLite database
 * (app_data_dir/data/my-little-todo.db) to the new local DataStore SQLite
 * (data.db managed by @tauri-apps/plugin-sql).
 *
 * The old schema had: files(path, content, created_at, updated_at),
 * settings(user_id, key, value, updated_at), blobs(id, owner, filename,
 * mime_type, size, created_at) — all without deleted_at.
 *
 * This runs on first launch after the architecture change. It reads the old
 * DB via a second SQL plugin connection and writes into the active DataStore.
 */

import type { DataStore } from './dataStore';

const MIGRATION_DONE_KEY = '__legacy_migration_done';

export async function migrateLegacyData(store: DataStore): Promise<void> {
  const done = await store.getSetting(MIGRATION_DONE_KEY);
  if (done === '1') return;

  let Database: typeof import('@tauri-apps/plugin-sql').default;
  try {
    Database = (await import('@tauri-apps/plugin-sql')).default;
  } catch {
    return;
  }

  let oldDb: Awaited<ReturnType<typeof Database.load>>;
  try {
    oldDb = await Database.load('sqlite:../data/my-little-todo.db');
  } catch {
    // Old database doesn't exist — fresh install, nothing to migrate
    await store.putSetting(MIGRATION_DONE_KEY, '1');
    return;
  }

  try {
    // ── Migrate files ────────────────────────────────────────────
    const files = await oldDb.select<{ path: string; content: string }[]>(
      'SELECT path, content FROM files',
    );
    for (const f of files) {
      const segments = f.path.split('/');
      await store.writeFile(f.content, ...segments);
    }
    console.log(`[Migration] Migrated ${files.length} files`);

    // ── Migrate settings ─────────────────────────────────────────
    // Old schema has (user_id, key, value); we take all settings
    // regardless of user_id for the local single-user store.
    const settings = await oldDb.select<{ key: string; value: string }[]>(
      'SELECT DISTINCT key, value FROM settings',
    );
    for (const s of settings) {
      await store.putSetting(s.key, s.value);
    }
    console.log(`[Migration] Migrated ${settings.length} settings`);

    await store.putSetting(MIGRATION_DONE_KEY, '1');
    console.log('[Migration] Legacy data migration completed');
  } catch (err) {
    console.error('[Migration] Error during migration:', err);
  } finally {
    try {
      await oldDb.close();
    } catch {
      /* ignore */
    }
  }
}
