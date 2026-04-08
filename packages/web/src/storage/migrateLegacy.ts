/**
 * One-time migration from an old (v0.3.x) server-format SQLite database
 * into the current relational DataStore.
 *
 * Old DB has multi-user `files` table with paths like:
 *   `{user_id}/data/tasks/xxx.md`
 *   `{user_id}/data/stream/yyyy-mm-dd.md`
 * and a `settings` table with `(user_id, key, value)`.
 *
 * Place the old `my-little-todo.db` at:
 *   %AppData%\com.mylittletodo.app\my-little-todo.db
 * (same dir as the new `data.db`, i.e. `sqlite:my-little-todo.db`).
 */

import { parseStreamFile, parseTaskFile } from '@my-little-todo/core';
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
    oldDb = await Database.load('sqlite:my-little-todo.db');
  } catch {
    return;
  }

  try {
    const hasFiles = await oldDb.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='files'",
    );
    if (hasFiles.length === 0) {
      console.warn('[Migration] Old DB has no `files` table — skipping');
      return;
    }

    const files = await oldDb.select<{ path: string; content: string }[]>(
      'SELECT path, content FROM files WHERE deleted_at IS NULL',
    );

    let tasksMigrated = 0;
    let streamEntriesMigrated = 0;

    const TASK_SEGMENT = '/data/tasks/';
    const STREAM_SEGMENT = '/data/stream/';

    // Identify the primary user_id by counting files per user prefix
    const userCounts = new Map<string, number>();
    for (const f of files) {
      const slash = f.path.indexOf('/');
      if (slash > 0) {
        const uid = f.path.slice(0, slash);
        userCounts.set(uid, (userCounts.get(uid) ?? 0) + 1);
      }
    }
    let primaryUserId: string | null = null;
    let maxCount = 0;
    for (const [uid, count] of userCounts) {
      if (count > maxCount) {
        maxCount = count;
        primaryUserId = uid;
      }
    }
    console.log(`[Migration] Primary user: ${primaryUserId} (${maxCount} files)`);

    for (const f of files) {
      const p = f.path.replace(/\\/g, '/');
      const taskIdx = p.indexOf(TASK_SEGMENT);
      const streamIdx = p.indexOf(STREAM_SEGMENT);

      if (taskIdx !== -1 && p.endsWith('.md')) {
        try {
          const task = parseTaskFile(f.content);
          await store.putTask(task);
          tasksMigrated++;
        } catch (e) {
          console.warn('[Migration] Failed task file', f.path, e);
        }
      } else if (streamIdx !== -1 && p.endsWith('.md')) {
        const after = p.slice(streamIdx + STREAM_SEGMENT.length);
        const dateKey = after.replace(/\.md$/, '');
        try {
          const entries = parseStreamFile(f.content, dateKey);
          for (const entry of entries) {
            await store.putStreamEntry(entry);
            streamEntriesMigrated++;
          }
        } catch (e) {
          console.warn('[Migration] Failed stream file', f.path, e);
        }
      }
    }

    const hasSettings = await oldDb.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'",
    );
    if (hasSettings.length > 0 && primaryUserId) {
      const settings = await oldDb.select<{ key: string; value: string }[]>(
        'SELECT key, value FROM settings WHERE user_id = $1 AND deleted_at IS NULL',
        [primaryUserId],
      );
      for (const s of settings) {
        if (s.key === MIGRATION_DONE_KEY) continue;
        await store.putSetting(s.key, s.value);
      }
      console.log(`[Migration] Imported ${settings.length} settings for user ${primaryUserId}`);
    }

    console.log(
      `[Migration] Done — ${tasksMigrated} tasks, ${streamEntriesMigrated} stream entries`,
    );

    await store.putSetting(MIGRATION_DONE_KEY, '1');
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
