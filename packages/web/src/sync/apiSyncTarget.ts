import { getAuthToken } from '../stores/authStore';
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

  private cachedJwt: string | null = null;
  private jwtExpiresAt = 0;

  constructor(opts: ApiSyncTargetOpts) {
    this.id = opts.id;
    this.baseUrl = opts.baseUrl;
    this.displayName = opts.displayName || `API Server (${opts.baseUrl || 'local'})`;
    this.staticToken = opts.token;
    this.authMode = opts.authMode ?? (opts.token ? 'token' : 'credentials');
    this.username = opts.username;
    this.password = opts.password;
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
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username, password: this.password }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `Login failed: HTTP ${res.status}`);
      }
      const data = await res.json();
      this.cachedJwt = data.token;
      // JWT expires in ~7 days; refresh 1 hour early
      this.jwtExpiresAt = Date.now() + 6 * 24 * 3600 * 1000;
      return data.token as string;
    } catch (err) {
      this.cachedJwt = null;
      this.jwtExpiresAt = 0;
      throw err;
    }
  }

  private async headers(): Promise<HeadersInit> {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    const t = await this.ensureToken();
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  private async authedFetch(url: string, init?: RequestInit): Promise<Response> {
    const h = await this.headers();
    const merged: RequestInit = { ...init, headers: { ...h, ...(init?.headers || {}) } };
    let res = await fetch(url, merged);

    if (res.status === 401 && this.authMode === 'credentials' && this.username) {
      this.cachedJwt = null;
      this.jwtExpiresAt = 0;
      const newH = await this.headers();
      res = await fetch(url, { ...init, headers: { ...newH, ...(init?.headers || {}) } });
    }

    return res;
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async pull(sinceVersion: number): Promise<{ changes: ChangeRecord[]; currentVersion: number }> {
    const res = await this.authedFetch(`${this.baseUrl}/api/sync/changes?since=${sinceVersion}`);
    if (!res.ok) throw new Error(`Pull failed: HTTP ${res.status}`);
    const data = await res.json();

    const changes: ChangeRecord[] = (data.changes || []).map((c: Record<string, unknown>) => ({
      table: c.table as ChangeRecord['table'],
      key: c.key as string,
      data: (c.data as string) ?? null,
      version: c.version as number,
      updatedAt: c.updated_at as string,
      deletedAt: (c.deleted_at as string) ?? null,
    }));

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

    const res = await this.authedFetch(`${this.baseUrl}/api/sync/push`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Push failed: HTTP ${res.status}`);
    const data = await res.json();
    return {
      ok: data.ok,
      applied: data.applied,
      currentVersion: data.current_version,
    };
  }

  async getRemoteVersion(): Promise<number> {
    const res = await this.authedFetch(`${this.baseUrl}/api/sync/status`);
    if (!res.ok) throw new Error(`Status check failed: HTTP ${res.status}`);
    const data = await res.json();
    return data.current_version as number;
  }
}
