import { getAuthToken } from '../stores/authStore';
import { createHttpClient, type HttpClient, type HttpRequest } from '../utils/httpClient';
import { isTauriEnv } from '../utils/platform';
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

function isCrossOriginTarget(baseUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URL(baseUrl).origin !== window.location.origin;
  } catch {
    return false;
  }
}

function formatFetchError(baseUrl: string, err: unknown): Error {
  if (
    err instanceof Error &&
    (err.name === 'TimeoutError' || /timeout|timed out/i.test(err.message))
  ) {
    return new Error(`Connection timed out while contacting ${baseUrl}`);
  }

  if (
    !isTauriEnv() &&
    err instanceof TypeError &&
    err.message === 'Failed to fetch' &&
    isCrossOriginTarget(baseUrl)
  ) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'this app';
    return new Error(
      `Cross-origin request blocked. Add ${origin} to CORS_ALLOWED_ORIGINS on ${baseUrl}.`,
    );
  }

  if (err instanceof Error) return err;
  return new Error(String(err));
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

  private cachedJwt: string | null = null;
  private jwtExpiresAt = 0;

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

  private async ensureToken(): Promise<string | null> {
    if (this.authMode === 'token') {
      return this.staticToken || getAuthToken();
    }

    if (this.cachedJwt && Date.now() < this.jwtExpiresAt) {
      return this.cachedJwt;
    }

    if (!this.username || !this.password) return null;

    const jwt = await this.login();
    return jwt;
  }

  private async login(): Promise<string | null> {
    const url = `${this.baseUrl}/api/auth/login`;
    try {
      console.info(`[Sync] Logging in to ${this.baseUrl} as "${this.username}"...`);
      const res = await this.httpClient.request({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        bodyText: JSON.stringify({ username: this.username, password: this.password }),
        timeoutMs: 10000,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as {
          error?: string;
        };
        throw new Error(data.error || `Login failed: HTTP ${res.status}`);
      }
      const data = (await res.json()) as { token: string };
      this.cachedJwt = data.token;
      this.jwtExpiresAt = Date.now() + 6 * 24 * 3600 * 1000;
      console.info('[Sync] Login successful, JWT cached');
      return data.token as string;
    } catch (err) {
      this.cachedJwt = null;
      this.jwtExpiresAt = 0;
      const formatted = formatFetchError(this.baseUrl, err);
      console.error(`[Sync] Login failed for ${url}:`, formatted);
      throw formatted;
    }
  }

  private async headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = await this.ensureToken();
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  private async authedRequest(url: string, init: Omit<HttpRequest, 'url'> = {}) {
    const h = await this.headers();
    const merged: HttpRequest = { ...init, url, headers: { ...h, ...(init.headers || {}) } };
    let res;
    try {
      res = await this.httpClient.request(merged);
    } catch (err) {
      throw formatFetchError(this.baseUrl, err);
    }

    if (res.status === 401 && this.authMode === 'credentials' && this.username) {
      this.cachedJwt = null;
      this.jwtExpiresAt = 0;
      const newH = await this.headers();
      try {
        res = await this.httpClient.request({
          ...init,
          url,
          headers: { ...newH, ...(init.headers || {}) },
        });
      } catch (err) {
        throw formatFetchError(this.baseUrl, err);
      }
    }

    return res;
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await this.httpClient.request({
        url: `${this.baseUrl}/health`,
        timeoutMs: 5000,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async pull(sinceVersion: number): Promise<{ changes: ChangeRecord[]; currentVersion: number }> {
    const res = await this.authedRequest(`${this.baseUrl}/api/sync/changes?since=${sinceVersion}`);
    if (!res.ok) throw new Error(`Pull failed: HTTP ${res.status}`);
    const data = (await res.json()) as {
      changes?: Record<string, unknown>[];
      current_version: number;
    };

    const changes: ChangeRecord[] = (data.changes || []).map((c: Record<string, unknown>) => {
      const rawUpdatedAt = c.updated_at;
      let updatedAt: string;
      if (typeof rawUpdatedAt === 'number') {
        updatedAt = new Date(rawUpdatedAt).toISOString();
      } else if (typeof rawUpdatedAt === 'string' && /^\d+$/.test(rawUpdatedAt)) {
        updatedAt = new Date(Number(rawUpdatedAt)).toISOString();
      } else {
        updatedAt = String(rawUpdatedAt ?? new Date().toISOString());
      }
      return {
        table: c.table as ChangeRecord['table'],
        key: c.key as string,
        data: (c.data as string) ?? null,
        version: c.version as number,
        updatedAt,
        deletedAt: (c.deleted_at as string) ?? null,
      };
    });

    return {
      changes,
      currentVersion: data.current_version as number,
    };
  }

  async push(changes: ChangeRecord[]): Promise<PushResult> {
    const body = {
      changes: changes.map((c) => ({
        table: c.table,
        key: c.key,
        data: c.data,
        version: c.version,
        updated_at: c.updatedAt,
        deleted_at: c.deletedAt,
      })),
    };

    const res = await this.authedRequest(`${this.baseUrl}/api/sync/push`, {
      method: 'POST',
      bodyText: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Push failed: HTTP ${res.status}`);
    const data = (await res.json()) as PushResult & { current_version: number };
    return {
      ok: data.ok,
      applied: data.applied,
      currentVersion: data.current_version,
    };
  }

  async getRemoteVersion(): Promise<number> {
    const res = await this.authedRequest(`${this.baseUrl}/api/sync/status`);
    if (!res.ok) throw new Error(`Status check failed: HTTP ${res.status}`);
    const data = (await res.json()) as { current_version: number };
    return data.current_version as number;
  }
}
