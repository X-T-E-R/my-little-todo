import { getAuthToken } from '../stores/authStore';
import { createHttpClient, type HttpClient, type HttpRequest } from '../utils/httpClient';
import { formatSyncRequestError, probeMltServer } from './serverProbe';
import type { ChangeRecord, PushResult, SyncTarget } from './types';

export type ApiAuthMode = 'token' | 'credentials';

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
  private staticToken?: string;
  private authMode: ApiAuthMode;
  private username?: string;
  private password?: string;
  private httpClient: HttpClient;

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private compatibilityCheckedAt = 0;

  constructor(opts: ApiSyncTargetOpts) {
    this.id = opts.id;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.displayName = opts.displayName || `API Server (${opts.baseUrl || 'local'})`;
    this.staticToken = opts.token;
    this.authMode = opts.authMode ?? (opts.token ? 'token' : 'credentials');
    this.username = opts.username;
    this.password = opts.password;
    this.httpClient = opts.httpClient ?? createHttpClient();
  }

  private async ensureCompatible(force = false): Promise<void> {
    const checkedRecently = Date.now() - this.compatibilityCheckedAt < 5 * 60 * 1000;
    if (!force && checkedRecently) return;

    await probeMltServer(this.baseUrl, this.httpClient);
    this.compatibilityCheckedAt = Date.now();
  }

  private async login(): Promise<string | null> {
    if (!this.username || !this.password) return null;

    try {
      await this.ensureCompatible();
      const response = await this.httpClient.request({
        url: `${this.baseUrl}/api/session/login`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        bodyText: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
        timeoutMs: 10_000,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({ error: `HTTP ${response.status}` }))) as {
          error?: string;
        };
        throw new Error(data.error || `Login failed: HTTP ${response.status}`);
      }
      const data = (await response.json()) as { token?: string };
      this.cachedToken = data.token ?? null;
      this.tokenExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      return this.cachedToken;
    } catch (err) {
      this.cachedToken = null;
      this.tokenExpiresAt = 0;
      throw formatSyncRequestError(this.baseUrl, err);
    }
  }

  private async ensureToken(): Promise<string | null> {
    if (this.authMode === 'token') {
      return this.staticToken || getAuthToken();
    }

    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    return this.login();
  }

  private async headers(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = await this.ensureToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  private async authedRequest(url: string, init: Omit<HttpRequest, 'url'> = {}) {
    await this.ensureCompatible();
    const headers = await this.headers();
    let response;

    try {
      response = await this.httpClient.request({
        ...init,
        url,
        headers: { ...headers, ...(init.headers || {}) },
      });
    } catch (err) {
      throw formatSyncRequestError(this.baseUrl, err);
    }

    if (response.status === 401 && this.authMode === 'credentials') {
      this.cachedToken = null;
      this.tokenExpiresAt = 0;
      const refreshedHeaders = await this.headers();
      try {
        response = await this.httpClient.request({
          ...init,
          url,
          headers: { ...refreshedHeaders, ...(init.headers || {}) },
        });
      } catch (err) {
        throw formatSyncRequestError(this.baseUrl, err);
      }
    }

    return response;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.ensureCompatible(true);
      const token = await this.ensureToken();
      if (this.authMode === 'token' && !token) return false;
      if (this.authMode === 'credentials' && this.username && this.password && !token) return false;
      return true;
    } catch (err) {
      return false;
    }
  }

  async pull(sinceVersion: number): Promise<{ changes: ChangeRecord[]; currentVersion: number }> {
    const response = await this.authedRequest(`${this.baseUrl}/api/sync/changes?since=${sinceVersion}`);
    if (!response.ok) {
      throw new Error(`Pull failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      changes?: Array<{
        table: ChangeRecord['table'];
        key: string;
        data?: string | null;
        version: number;
        updated_at: string | number;
        deleted_at?: string | null;
      }>;
      current_version: number;
    };

    const changes: ChangeRecord[] = (data.changes || []).map((change) => ({
      table: change.table,
      key: change.key,
      data: change.data ?? null,
      version: change.version,
      updatedAt:
        typeof change.updated_at === 'number'
          ? new Date(change.updated_at).toISOString()
          : String(change.updated_at),
      deletedAt: change.deleted_at ?? null,
    }));

    return {
      changes,
      currentVersion: data.current_version,
    };
  }

  async push(changes: ChangeRecord[]): Promise<PushResult> {
    const response = await this.authedRequest(`${this.baseUrl}/api/sync/push`, {
      method: 'POST',
      bodyText: JSON.stringify({
        changes: changes.map((change) => ({
          table: change.table,
          key: change.key,
          data: change.data,
          version: change.version,
          updated_at: change.updatedAt,
          deleted_at: change.deletedAt,
        })),
      }),
    });
    if (!response.ok) {
      throw new Error(`Push failed: HTTP ${response.status}`);
    }
    const data = (await response.json()) as {
      ok: boolean;
      applied: number;
      current_version: number;
    };
    return {
      ok: data.ok,
      applied: data.applied,
      currentVersion: data.current_version,
    };
  }

  async getRemoteVersion(): Promise<number> {
    const response = await this.authedRequest(`${this.baseUrl}/api/sync/status`);
    if (!response.ok) {
      throw new Error(`Status check failed: HTTP ${response.status}`);
    }
    const data = (await response.json()) as { current_version: number };
    return data.current_version;
  }
}
