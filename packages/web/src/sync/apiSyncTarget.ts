import { createHttpClient, type HttpClient } from '../utils/httpClient';
import { formatSyncRequestError, probeMltServer } from './serverProbe';
import type { ChangeRecord, PushResult, SyncTarget } from './types';

export type ApiAuthMode = 'token' | 'credentials';

const LEGACY_SYNC_RETIREMENT_MESSAGE =
  'Legacy API-server sync has been removed. Reconnect this app to the shared server backend and use the new Electric-based sync flow instead.';

interface ApiSyncTargetOpts {
  id: string;
  baseUrl: string;
  displayName?: string;
  token?: string;
  authMode?: ApiAuthMode;
  username?: string;
  password?: string;
  httpClient?: HttpClient;
}

export class ApiServerSyncTarget implements SyncTarget {
  readonly id: string;
  readonly type = 'api-server';
  readonly displayName: string;

  private baseUrl: string;
  private httpClient: HttpClient;
  private compatibilityCheckedAt = 0;

  constructor(opts: ApiSyncTargetOpts) {
    this.id = opts.id;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.displayName = opts.displayName || `API Server (${opts.baseUrl || 'local'})`;
    this.httpClient = opts.httpClient ?? createHttpClient();
  }

  private async ensureCompatible(force = false): Promise<void> {
    const checkedRecently = Date.now() - this.compatibilityCheckedAt < 5 * 60 * 1000;
    if (!force && checkedRecently) return;

    await probeMltServer(this.baseUrl, this.httpClient);
    this.compatibilityCheckedAt = Date.now();
  }

  private async throwRetiredSyncError(): Promise<never> {
    try {
      await this.ensureCompatible();
    } catch (err) {
      throw formatSyncRequestError(this.baseUrl, err);
    }
    throw new Error(LEGACY_SYNC_RETIREMENT_MESSAGE);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.ensureCompatible(true);
      return false;
    } catch {
      return false;
    }
  }

  async pull(sinceVersion: number): Promise<{ changes: ChangeRecord[]; currentVersion: number }> {
    void sinceVersion;
    return this.throwRetiredSyncError();
  }

  async push(changes: ChangeRecord[]): Promise<PushResult> {
    void changes;
    return this.throwRetiredSyncError();
  }

  async getRemoteVersion(): Promise<number> {
    return this.throwRetiredSyncError();
  }
}
