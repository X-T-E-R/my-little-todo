/**
 * Core sync types shared by the sync engine and all SyncTarget implementations.
 */

export interface ChangeRecord {
  table: 'files' | 'settings' | 'blobs';
  key: string;
  content: string | null;
  version: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PushResult {
  ok: boolean;
  applied: number;
  currentVersion: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline' | 'conflict';

export interface SyncTargetConfig {
  id: string;
  type: string;
  displayName: string;
  enabled: boolean;
  config: Record<string, string>;
}

export interface SyncTarget {
  readonly id: string;
  readonly type: string;
  readonly displayName: string;

  testConnection(): Promise<boolean>;
  pull(sinceVersion: number): Promise<{ changes: ChangeRecord[]; currentVersion: number }>;
  push(changes: ChangeRecord[]): Promise<PushResult>;
  getRemoteVersion(): Promise<number>;
}

export interface SyncState {
  targetId: string;
  status: SyncStatus;
  lastSyncAt: number;
  lastPushVersion: number;
  lastPullVersion: number;
  error?: string;
}

// ── Conflict resolution ───────────────────────────────────────────

export type ConflictStrategy = 'lww' | 'manual';

export interface SyncConflict {
  table: 'files' | 'settings';
  key: string;
  local: ChangeRecord;
  remote: ChangeRecord;
}

export type ConflictResolution = 'local' | 'remote';

export interface ResolvedConflict {
  conflict: SyncConflict;
  resolution: ConflictResolution;
}
