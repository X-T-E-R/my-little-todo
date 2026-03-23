import type { StorageAdapter } from './adapter';
import { getAuthToken } from '../stores/authStore';

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
      await fetch(`${baseUrl}/api/files?path=${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ content }),
      });
    },

    async deleteFile(...segments: string[]): Promise<void> {
      const path = segments.join('/');
      try {
        await fetch(`${baseUrl}/api/files?path=${encodeURIComponent(path)}`, {
          method: 'DELETE',
          headers: headers(),
        });
      } catch {
        // ignore
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
