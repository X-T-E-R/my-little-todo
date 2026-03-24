import { getAuthToken } from '../stores/authStore';
import type { StorageAdapter } from './adapter';
import { enqueueOperation } from './offlineQueue';

export function createApiAdapter(baseUrl: string, token?: string): StorageAdapter {
  const headers = (): HeadersInit => {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    const authToken = token || getAuthToken();
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    return h;
  };

  return {
    async readFile(...segments: string[]): Promise<string | null> {
      const path = segments.join('/');
      try {
        const res = await fetch(`${baseUrl}/api/files?path=${encodeURIComponent(path)}`, {
          headers: headers(),
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
          headers: headers(),
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
          headers: headers(),
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
          headers: headers(),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.files ?? [];
      } catch {
        return [];
      }
    },
  };
}
