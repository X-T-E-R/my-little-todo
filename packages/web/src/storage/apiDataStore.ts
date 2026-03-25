import { getAuthToken } from '../stores/authStore';
import type { AttachmentConfig, UploadResult } from './blobApi';
import type { DataStore } from './dataStore';
import { enqueueOperation } from './offlineQueue';

export function createApiDataStore(baseUrl: string, token?: string): DataStore {
  const jsonHeaders = (): HeadersInit => {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    const t = token || getAuthToken();
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  };

  const authOnly = (): HeadersInit => {
    const h: HeadersInit = {};
    const t = token || getAuthToken();
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  };

  return {
    // ── Files ──────────────────────────────────────────────────────

    async readFile(...segments: string[]): Promise<string | null> {
      const path = segments.join('/');
      try {
        const res = await fetch(`${baseUrl}/api/files?path=${encodeURIComponent(path)}`, {
          headers: jsonHeaders(),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.content ?? null;
      } catch {
        return null;
      }
    },

    async writeFile(content: string, ...segments: string[]): Promise<void> {
      const path = segments.join('/');
      try {
        const res = await fetch(`${baseUrl}/api/files?path=${encodeURIComponent(path)}`, {
          method: 'PUT',
          headers: jsonHeaders(),
          body: JSON.stringify({ content }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        await enqueueOperation({ type: 'writeFile', args: segments, content });
      }
    },

    async deleteFile(...segments: string[]): Promise<void> {
      const path = segments.join('/');
      try {
        const res = await fetch(`${baseUrl}/api/files?path=${encodeURIComponent(path)}`, {
          method: 'DELETE',
          headers: jsonHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        await enqueueOperation({ type: 'deleteFile', args: segments });
      }
    },

    async listFiles(...segments: string[]): Promise<string[]> {
      const dir = segments.join('/');
      try {
        const res = await fetch(`${baseUrl}/api/files/list?dir=${encodeURIComponent(dir)}`, {
          headers: jsonHeaders(),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.files ?? [];
      } catch {
        return [];
      }
    },

    // ── Settings ───────────────────────────────────────────────────

    async getSetting(key: string): Promise<string | null> {
      try {
        const res = await fetch(
          `${baseUrl}/api/settings?key=${encodeURIComponent(key)}`,
          { headers: jsonHeaders() },
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data.value ?? null;
      } catch {
        return null;
      }
    },

    async putSetting(key: string, value: string): Promise<void> {
      await fetch(`${baseUrl}/api/settings`, {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify({ key, value }),
      });
    },

    async deleteSetting(key: string): Promise<void> {
      await fetch(`${baseUrl}/api/settings?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: jsonHeaders(),
      });
    },

    async getAllSettings(): Promise<Record<string, string>> {
      try {
        const res = await fetch(`${baseUrl}/api/settings`, { headers: jsonHeaders() });
        if (!res.ok) return {};
        return await res.json();
      } catch {
        return {};
      }
    },

    // ── Blobs ──────────────────────────────────────────────────────

    async uploadBlob(file: File): Promise<UploadResult> {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${baseUrl}/api/blobs/upload`, {
        method: 'POST',
        headers: authOnly(),
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      return res.json();
    },

    getBlobUrl(id: string): string {
      return `${baseUrl}/api/blobs/${id}`;
    },

    async deleteBlob(id: string): Promise<void> {
      await fetch(`${baseUrl}/api/blobs/${id}`, {
        method: 'DELETE',
        headers: authOnly(),
      });
    },

    async getAttachmentConfig(): Promise<AttachmentConfig> {
      try {
        const res = await fetch(`${baseUrl}/api/blobs/config`, {
          headers: jsonHeaders(),
        });
        if (!res.ok) {
          return { allow_attachments: true, max_size: 10 * 1024 * 1024, storage: 'local', image_host_url: '' };
        }
        return res.json();
      } catch {
        return { allow_attachments: true, max_size: 10 * 1024 * 1024, storage: 'local', image_host_url: '' };
      }
    },
  };
}
