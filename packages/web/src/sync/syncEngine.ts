import { getDataStore } from '../storage/dataStore';
import type {
  ChangeRecord,
  ConflictStrategy,
  ResolvedConflict,
  SyncConflict,
  SyncState,
  SyncTarget,
} from './types';

const SYNC_META_PREFIX = '__sync_';
const DEFAULT_DEBOUNCE_MS = 30_000;

/**
 * The SyncEngine manages one or more SyncTargets, pulling remote changes
 * into the local DataStore and pushing local changes out.
 *
 * Supports LWW (last-write-wins) automatic conflict resolution and
 * manual resolution via onConflict callback.
 */
export class SyncEngine {
  private targets: Map<string, SyncTarget> = new Map();
  private states: Map<string, SyncState> = new Map();
  private timerId: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs = DEFAULT_DEBOUNCE_MS;
  private listeners: Set<(states: Map<string, SyncState>) => void> = new Set();
  private conflictListeners: Set<(conflicts: SyncConflict[], targetId: string) => void> =
    new Set();
  private pendingConflictResolve: ((resolutions: ResolvedConflict[]) => void) | null = null;
  private _conflictStrategy: ConflictStrategy = 'lww';
  private _autoSyncInterval = 5 * 60 * 1000;

  // ── Target management ─────────────────────────────────────────────

  addTarget(target: SyncTarget): void {
    this.targets.set(target.id, target);
    this.states.set(target.id, {
      targetId: target.id,
      status: 'idle',
      lastSyncAt: 0,
      lastPushVersion: 0,
      lastPullVersion: 0,
    });
    this.notify();
  }

  removeTarget(id: string): void {
    this.targets.delete(id);
    this.states.delete(id);
    this.notify();
  }

  clearTargets(): void {
    this.targets.clear();
    this.states.clear();
    this.notify();
  }

  getTargets(): SyncTarget[] {
    return Array.from(this.targets.values());
  }

  hasTargets(): boolean {
    return this.targets.size > 0;
  }

  getState(id: string): SyncState | undefined {
    return this.states.get(id);
  }

  getAllStates(): SyncState[] {
    return Array.from(this.states.values());
  }

  // ── Conflict strategy ─────────────────────────────────────────────

  setConflictStrategy(strategy: ConflictStrategy): void {
    this._conflictStrategy = strategy;
  }

  getConflictStrategy(): ConflictStrategy {
    return this._conflictStrategy;
  }

  // ── Listeners ─────────────────────────────────────────────────────

  onStateChange(listener: (states: Map<string, SyncState>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onConflict(
    listener: (conflicts: SyncConflict[], targetId: string) => void,
  ): () => void {
    this.conflictListeners.add(listener);
    return () => this.conflictListeners.delete(listener);
  }

  resolveConflicts(resolutions: ResolvedConflict[]): void {
    if (this.pendingConflictResolve) {
      this.pendingConflictResolve(resolutions);
      this.pendingConflictResolve = null;
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.states);
    }
  }

  private updateState(id: string, partial: Partial<SyncState>): void {
    const current = this.states.get(id);
    if (current) {
      this.states.set(id, { ...current, ...partial });
      this.notify();
    }
  }

  // ── Core sync cycle ───────────────────────────────────────────────

  async syncTarget(targetId: string): Promise<void> {
    const target = this.targets.get(targetId);
    if (!target) return;

    const state = this.states.get(targetId);
    if (!state || state.status === 'syncing') return;

    this.updateState(targetId, { status: 'syncing', error: undefined });

    try {
      const store = getDataStore();

      // ── 1. Read local changes since last push ─────────────────
      const lastPushAt = await this.loadSyncMeta(targetId, 'lastPushAt');
      let localChanges: ChangeRecord[] = [];
      if (store.getChangesSince) {
        const raw = await store.getChangesSince(lastPushAt);
        localChanges = raw.map((r) => ({
          table: r.table,
          key: r.key,
          content: r.content,
          version: r.updatedAt,
          updatedAt: new Date(r.updatedAt).toISOString(),
          deletedAt: r.deletedAt ? new Date(r.deletedAt).toISOString() : null,
        }));
      }

      // ── 2. Pull remote changes ────────────────────────────────
      const lastPullVersion = await this.loadSyncMeta(targetId, 'lastPullVersion');
      const pullResult = await target.pull(lastPullVersion);

      // ── 3. Detect conflicts ───────────────────────────────────
      const localKeyMap = new Map<string, ChangeRecord>();
      for (const lc of localChanges) {
        localKeyMap.set(`${lc.table}:${lc.key}`, lc);
      }

      const conflicts: SyncConflict[] = [];
      const nonConflictingRemote: ChangeRecord[] = [];

      for (const rc of pullResult.changes) {
        const localKey = `${rc.table}:${rc.key}`;
        const localMatch = localKeyMap.get(localKey);
        if (localMatch) {
          if (rc.table !== 'blobs') {
            conflicts.push({
              table: rc.table as 'files' | 'settings',
              key: rc.key,
              local: localMatch,
              remote: rc,
            });
          }
        } else {
          nonConflictingRemote.push(rc);
        }
      }

      // ── 4. Resolve conflicts ──────────────────────────────────
      const resolvedLocal: ChangeRecord[] = [];
      const resolvedRemote: ChangeRecord[] = [];

      if (conflicts.length > 0) {
        if (this._conflictStrategy === 'lww') {
          for (const c of conflicts) {
            const localTs = new Date(c.local.updatedAt).getTime();
            const remoteTs = new Date(c.remote.updatedAt).getTime();
            if (localTs >= remoteTs) {
              resolvedLocal.push(c.local);
            } else {
              resolvedRemote.push(c.remote);
            }
          }
        } else {
          this.updateState(targetId, { status: 'conflict' });
          for (const listener of this.conflictListeners) {
            listener(conflicts, targetId);
          }

          const resolutions = await new Promise<ResolvedConflict[]>((resolve) => {
            this.pendingConflictResolve = resolve;
          });

          for (const r of resolutions) {
            if (r.resolution === 'local') {
              resolvedLocal.push(r.conflict.local);
            } else {
              resolvedRemote.push(r.conflict.remote);
            }
          }
          this.updateState(targetId, { status: 'syncing' });
        }
      }

      // ── 5. Apply non-conflicting + resolved remote changes ────
      for (const change of nonConflictingRemote) {
        await this.applyRemoteChange(store, change);
      }
      for (const change of resolvedRemote) {
        await this.applyRemoteChange(store, change);
      }

      await this.saveSyncMeta(targetId, 'lastPullVersion', pullResult.currentVersion);

      // ── 6. Push local changes + resolved-as-local ─────────────
      const conflictRemoteKeys = new Set(
        conflicts.map((c) => `${c.table}:${c.key}`),
      );
      const nonConflictingLocal = localChanges.filter(
        (lc) => !conflictRemoteKeys.has(`${lc.table}:${lc.key}`),
      );
      const changesToPush = [...nonConflictingLocal, ...resolvedLocal];

      if (changesToPush.length > 0) {
        await target.push(changesToPush);
      }

      const newPushAt = Date.now();
      await this.saveSyncMeta(targetId, 'lastPushAt', newPushAt);

      this.updateState(targetId, {
        status: 'idle',
        lastSyncAt: Date.now(),
        lastPullVersion: pullResult.currentVersion,
      });
    } catch (err) {
      this.updateState(targetId, {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async syncAll(): Promise<void> {
    if (this.targets.size === 0) return;
    const promises = Array.from(this.targets.keys()).map((id) => this.syncTarget(id));
    await Promise.allSettled(promises);
  }

  // ── Auto sync (periodic) ──────────────────────────────────────────

  get autoSyncInterval(): number {
    return this._autoSyncInterval;
  }

  setAutoSyncInterval(ms: number): void {
    this._autoSyncInterval = ms;
    if (this.timerId) {
      this.startAutoSync(ms);
    }
  }

  startAutoSync(intervalMs?: number): void {
    if (intervalMs !== undefined) this._autoSyncInterval = intervalMs;
    this.stopAutoSync();
    if (this._autoSyncInterval <= 0) return;
    this.timerId = setInterval(() => this.syncAll(), this._autoSyncInterval);
    window.addEventListener('online', this.handleOnline);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  stopAutoSync(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    window.removeEventListener('online', this.handleOnline);
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  private handleOnline = (): void => {
    this.syncAll();
  };

  private handleVisibility = (): void => {
    if (document.visibilityState === 'visible' && this.targets.size > 0) {
      this.syncAll();
    }
  };

  // ── Debounced sync on local data write ────────────────────────────

  notifyLocalChange(): void {
    if (this.targets.size === 0) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.syncAll();
    }, this.debounceMs);
  }

  setDebounceMs(ms: number): void {
    this.debounceMs = ms;
  }

  // ── Apply a single remote change to the local DataStore ───────────

  private async applyRemoteChange(
    store: Awaited<ReturnType<typeof getDataStore>>,
    change: ChangeRecord,
  ): Promise<void> {
    if (change.table === 'files') {
      if (change.deletedAt) {
        const segments = change.key.split('/');
        await store.deleteFile(...segments);
      } else if (change.content != null) {
        const segments = change.key.split('/');
        await store.writeFile(change.content, ...segments);
      }
    } else if (change.table === 'settings') {
      const colonIdx = change.key.indexOf(':');
      const settingKey = colonIdx >= 0 ? change.key.slice(colonIdx + 1) : change.key;
      if (change.deletedAt) {
        await store.deleteSetting(settingKey);
      } else if (change.content != null) {
        await store.putSetting(settingKey, change.content);
      }
    }
  }

  // ── Persist sync metadata ─────────────────────────────────────────

  private async loadSyncMeta(targetId: string, key: string): Promise<number> {
    const store = getDataStore();
    const val = await store.getSetting(`${SYNC_META_PREFIX}${targetId}_${key}`);
    return val ? Number(val) : 0;
  }

  private async saveSyncMeta(targetId: string, key: string, value: number): Promise<void> {
    const store = getDataStore();
    await store.putSetting(`${SYNC_META_PREFIX}${targetId}_${key}`, String(value));
  }
}

// ── Global singleton ────────────────────────────────────────────────

let _engine: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  if (!_engine) _engine = new SyncEngine();
  return _engine;
}
