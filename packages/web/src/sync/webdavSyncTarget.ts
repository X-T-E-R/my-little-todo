import { createHttpClient, type HttpClient } from '../utils/httpClient';
import type { ChangeRecord, PushResult, SyncTarget } from './types';

/**
 * WebDAV sync: `manifest.json` + `data/tasks/{id}.json`, `data/stream/{id}.json`, `settings/{key}.json`.
 */
export class WebDavSyncTarget implements SyncTarget {
  readonly id: string;
  readonly type = 'webdav';
  readonly displayName: string;

  private baseUrl: string;
  private username: string;
  private password: string;
  private httpClient: HttpClient;

  constructor(opts: {
    id: string;
    baseUrl: string;
    username: string;
    password: string;
    displayName?: string;
    httpClient?: HttpClient;
  }) {
    this.id = opts.id;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.username = opts.username;
    this.password = opts.password;
    this.displayName = opts.displayName || `WebDAV (${this.baseUrl})`;
    this.httpClient = opts.httpClient ?? createHttpClient();
  }

  private authHeaders(): Record<string, string> {
    const creds = encodeBasicAuth(`${this.username}:${this.password}`);
    return {
      Authorization: `Basic ${creds}`,
    };
  }

  private syncRoot(): string {
    return `${this.baseUrl}/mlt-sync`;
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await this.httpClient.request({
        url: this.syncRoot(),
        method: 'PROPFIND',
        headers: {
          ...this.authHeaders(),
          Depth: '0',
        },
        timeoutMs: 10000,
      });
      if (res.status === 207) return true;
      if (res.status === 404) {
        const mkRes = await this.httpClient.request({
          url: `${this.syncRoot()}/`,
          method: 'MKCOL',
          headers: this.authHeaders(),
        });
        return mkRes.ok || mkRes.status === 201 || mkRes.status === 405;
      }
      return false;
    } catch {
      return false;
    }
  }

  async pull(sinceVersion: number): Promise<{ changes: ChangeRecord[]; currentVersion: number }> {
    const manifest = await this.readJson<{ version: number }>('manifest.json');
    const currentVersion = manifest?.version ?? 0;

    if (currentVersion <= sinceVersion) {
      return { changes: [], currentVersion };
    }

    const changes: ChangeRecord[] = [];

    for (const name of await this.listDir('data/tasks')) {
      const record = await this.readJson<ChangeRecord>(`data/tasks/${name}`);
      if (record && record.version > sinceVersion) {
        changes.push(record);
      }
    }
    for (const name of await this.listDir('data/stream')) {
      const record = await this.readJson<ChangeRecord>(`data/stream/${name}`);
      if (record && record.version > sinceVersion) {
        changes.push(record);
      }
    }
    for (const name of await this.listDir('settings')) {
      const record = await this.readJson<ChangeRecord>(`settings/${name}`);
      if (record && record.version > sinceVersion) {
        changes.push(record);
      }
    }

    changes.sort((a, b) => a.version - b.version);
    return { changes, currentVersion };
  }

  async push(changes: ChangeRecord[]): Promise<PushResult> {
    await this.ensureDir('data');
    await this.ensureDir('data/tasks');
    await this.ensureDir('data/stream');
    await this.ensureDir('settings');

    let maxVersion = 0;
    for (const change of changes) {
      if (change.version > maxVersion) maxVersion = change.version;

      const safeKey = `${encodeURIComponent(change.key)}.json`;
      if (change.table === 'tasks') {
        await this.writeJson(`data/tasks/${safeKey}`, change);
      } else if (change.table === 'stream_entries') {
        await this.writeJson(`data/stream/${safeKey}`, change);
      } else if (change.table === 'settings') {
        await this.writeJson(`settings/${safeKey}`, change);
      }
    }

    const manifest = (await this.readJson<{ version: number }>('manifest.json')) || { version: 0 };
    manifest.version = Math.max(manifest.version, maxVersion);
    await this.writeJson('manifest.json', manifest);

    return {
      ok: true,
      applied: changes.length,
      currentVersion: manifest.version,
    };
  }

  async getRemoteVersion(): Promise<number> {
    const manifest = await this.readJson<{ version: number }>('manifest.json');
    return manifest?.version ?? 0;
  }

  private async readJson<T>(path: string): Promise<T | null> {
    try {
      const res = await this.httpClient.request({
        url: `${this.syncRoot()}/${path}`,
        headers: this.authHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private async writeJson(path: string, data: unknown): Promise<void> {
    const res = await this.httpClient.request({
      url: `${this.syncRoot()}/${path}`,
      method: 'PUT',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json',
      },
      bodyText: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`WebDAV PUT failed: ${res.status} ${path}`);
    }
  }

  /** Create each path segment (e.g. `data` then `data/tasks`) for strict WebDAV servers. */
  private async ensureDir(path: string): Promise<void> {
    const segments = path.split('/').filter(Boolean);
    let acc = '';
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      try {
        const res = await this.httpClient.request({
          url: `${this.syncRoot()}/${acc}/`,
          method: 'MKCOL',
          headers: this.authHeaders(),
        });
        if (!res.ok && res.status !== 405 && res.status !== 409) {
          // 405/409 often mean collection already exists
        }
      } catch {
        // May already exist
      }
    }
  }

  private async listDir(name: string): Promise<string[]> {
    try {
      const res = await this.httpClient.request({
        url: `${this.syncRoot()}/${name}/`,
        method: 'PROPFIND',
        headers: {
          ...this.authHeaders(),
          Depth: '1',
          'Content-Type': 'application/xml',
        },
        bodyText:
          '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>',
      });
      if (!res.ok) return [];

      const text = await res.text();
      const matches = text.match(/<d:displayname>([^<]+)<\/d:displayname>/gi) || [];
      return matches
        .map((m) => m.replace(/<\/?d:displayname>/gi, ''))
        .filter((n) => n.endsWith('.json'));
    } catch {
      return [];
    }
  }
}

function encodeBasicAuth(value: string): string {
  if (typeof btoa === 'function') return btoa(value);
  return Buffer.from(value, 'utf8').toString('base64');
}
