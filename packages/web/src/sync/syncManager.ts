import { getDataStore } from '../storage/dataStore';
import { ApiServerSyncTarget, type ApiAuthMode } from './apiSyncTarget';
import { S3SyncTarget } from './s3SyncTarget';
import { getSyncEngine } from './syncEngine';
import type { ConflictStrategy } from './types';
import { WebDavSyncTarget } from './webdavSyncTarget';

/**
 * Read sync configuration from the local DataStore and register
 * the appropriate SyncTarget with the SyncEngine.
 * Called once at app startup (for native clients) and again
 * whenever the user saves new sync settings.
 */
export async function initSyncFromConfig(): Promise<void> {
  const store = getDataStore();
  const provider = await store.getSetting('sync-provider');
  const rawConfig = await store.getSetting('sync-config');
  const strategy =
    ((await store.getSetting('sync-conflict-strategy')) as ConflictStrategy | null) ?? 'lww';
  const intervalStr = await store.getSetting('sync-interval');

  const engine = getSyncEngine();
  engine.clearTargets();
  engine.stopAutoSync();
  engine.setConflictStrategy(strategy);

  if (!provider || !rawConfig) return;

  let cfg: Record<string, string>;
  try {
    cfg = JSON.parse(rawConfig);
  } catch {
    return;
  }

  if (provider === 'api-server') {
    const authMode = (cfg.auth_mode as ApiAuthMode) || (cfg.token ? 'token' : 'credentials');
    engine.addTarget(
      new ApiServerSyncTarget({
        id: 'api',
        baseUrl: cfg.endpoint || '',
        displayName: `API Server (${cfg.endpoint || 'local'})`,
        authMode,
        token: authMode === 'token' ? cfg.token : undefined,
        username: authMode === 'credentials' ? cfg.username : undefined,
        password: authMode === 'credentials' ? cfg.password : undefined,
      }),
    );
  } else if (provider === 'webdav') {
    engine.addTarget(
      new WebDavSyncTarget({
        id: 'webdav',
        baseUrl: cfg.endpoint || '',
        username: cfg.username || '',
        password: cfg.password || '',
      }),
    );
  } else if (provider === 's3') {
    engine.addTarget(
      new S3SyncTarget({
        id: 's3',
        endpoint: cfg.endpoint || '',
        bucket: cfg.bucket || '',
        accessKey: cfg.access_key || '',
        secretKey: cfg.secret_key || '',
      }),
    );
  }

  const interval = intervalStr ? Number(intervalStr) : 5 * 60 * 1000;
  if (interval > 0) {
    engine.startAutoSync(interval);
  }
}
