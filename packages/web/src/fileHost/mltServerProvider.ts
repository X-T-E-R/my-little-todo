import { getAuthToken } from '../stores/authStore';
import type { FileCategory, FileHostProvider, MltServerFileHostConfig } from './types';

async function loginIfNeeded(config: MltServerFileHostConfig): Promise<string | null> {
  if (config.authMode === 'token') {
    return config.token || getAuthToken();
  }
  if (config.authMode === 'session') {
    return getAuthToken();
  }
  if (!config.username || !config.password) return null;

  const baseUrl = config.endpoint.replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.password }),
  });
  if (!res.ok) {
    throw new Error(`MLT Server login failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { token?: string };
  return data.token ?? null;
}

function absolutize(baseUrl: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${baseUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

export function createMltServerFileHostProvider(config: MltServerFileHostConfig): FileHostProvider {
  return {
    id: 'mlt-server',
    async upload(file: File, category: FileCategory) {
      const baseUrl = (config.endpoint || window.location.origin).replace(/\/+$/, '');
      const token = await loginIfNeeded(config);
      const form = new FormData();
      form.append('file', file);
      form.append('category', category);

      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${baseUrl}/api/file-host/upload`, {
        method: 'POST',
        headers,
        body: form,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as {
          error?: string;
        };
        throw new Error(data.error || `MLT Server upload failed: HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        id: string;
        url: string;
        filename: string;
        mime_type: string;
        size: number;
      };
      return {
        id: data.id,
        provider: 'mlt-server',
        category,
        url: absolutize(baseUrl, data.url),
        fileName: data.filename,
        mimeType: data.mime_type,
        size: data.size,
      };
    },
  };
}
