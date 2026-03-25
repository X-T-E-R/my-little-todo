import type { ChangeRecord, PushResult, SyncTarget } from './types';

/**
 * SyncTarget that stores data as JSON files on a WebDAV server.
 *
 * Directory structure on the WebDAV server:
 *   /mlt-sync/
 *     manifest.json        — { version: number, updatedAt: string }
 *     files/               — one JSON per file record
 *       <encoded-path>.json
 *     settings/            — one JSON per setting
 *       <key>.json
 *
 * This is a basic implementation suitable for NAS/NextCloud/iCloud.
 * It uses Last-Write-Wins with the manifest version number.
 */
export class WebDavSyncTarget implements SyncTarget {
  readonly id: string;
  readonly type = 'webdav';
  readonly displayName: string;

  private baseUrl: string;
  private username: string;
  private password: string;

  constructor(opts: {
    id: string;
    baseUrl: string;
    username: string;
    password: string;
    displayName?: string;
  }) {
    this.id = opts.id;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.username = opts.username;
    this.password = opts.password;
    this.displayName = opts.displayName || `WebDAV (${this.baseUrl})`;
  }

  private authHeaders(): HeadersInit {
    const creds = btoa(`${this.username}:${this.password}`);
    return {
      Authorization: `Basic ${creds}`,
    };
  }

  private syncRoot(): string {
    return `${this.baseUrl}/mlt-sync`;
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(this.syncRoot(), {
        method: 'PROPFIND',
        headers: {
          ...this.authHeaders(),
          Depth: '0',
        },
        signal: AbortSignal.timeout(10000),
      });
      // 207 Multi-Status = exists, 404 = needs creation
      if (res.status === 207) return true;
      if (res.status === 404) {
        // Try to create the directory
        const mkRes = await fetch(this.syncRoot() + '/', {
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

    // Read all file records
    const fileEntries = await this.listDir('files');
    for (const name of fileEntries) {
      const record = await this.readJson<ChangeRecord>(`files/${name}`);
      if (record && record.version > sinceVersion) {
        changes.push(record);
      }
    }

    // Read all setting records
    const settingEntries = await this.listDir('settings');
    for (const name of settingEntries) {
      const record = await this.readJson<ChangeRecord>(`settings/${name}`);
      if (record && record.version > sinceVersion) {
        changes.push(record);
      }
    }

    changes.sort((a, b) => a.version - b.version);
    return { changes, currentVersion };
  }

  async push(changes: ChangeRecord[]): Promise<PushResult> {
    // Ensure directories exist
    await this.ensureDir('files');
    await this.ensureDir('settings');

    let maxVersion = 0;
    for (const change of changes) {
      if (change.version > maxVersion) maxVersion = change.version;

      if (change.table === 'files') {
        const safeName = encodeURIComponent(change.key) + '.json';
        await this.writeJson(`files/${safeName}`, change);
      } else if (change.table === 'settings') {
        const safeName = encodeURIComponent(change.key) + '.json';
        await this.writeJson(`settings/${safeName}`, change);
      }
    }

    // Update manifest
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

  // ── WebDAV helpers ─────────────────────────────────────────────

  private async readJson<T>(path: string): Promise<T | null> {
    try {
      const res = await fetch(`${this.syncRoot()}/${path}`, {
        headers: this.authHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private async writeJson(path: string, data: unknown): Promise<void> {
    await fetch(`${this.syncRoot()}/${path}`, {
      method: 'PUT',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  }

  private async ensureDir(name: string): Promise<void> {
    try {
      await fetch(`${this.syncRoot()}/${name}/`, {
        method: 'MKCOL',
        headers: this.authHeaders(),
      });
    } catch {
      // May already exist
    }
  }

  private async listDir(name: string): Promise<string[]> {
    try {
      const res = await fetch(`${this.syncRoot()}/${name}/`, {
        method: 'PROPFIND',
        headers: {
          ...this.authHeaders(),
          Depth: '1',
          'Content-Type': 'application/xml',
        },
        body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>`,
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
