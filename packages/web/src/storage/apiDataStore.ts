import {
  type StreamEntryDbRow,
  type TaskDbRow,
  streamEntryFromDbRow,
  streamEntryToDbRow,
  taskFromDbRow,
  taskToDbRow,
} from '@my-little-todo/core';
import type { StreamEntry, Task } from '@my-little-todo/core';
import { getAuthToken } from '../stores/authStore';
import type { AttachmentConfig, UploadResult } from './blobApi';
import type { DataStore } from './dataStore';

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
    async getAllTasks(): Promise<Task[]> {
      const res = await fetch(`${baseUrl}/api/tasks`, { headers: authOnly() });
      if (!res.ok) return [];
      const rows = (await res.json()) as string[];
      return rows.map((s) => taskFromDbRow(JSON.parse(s) as TaskDbRow));
    },

    async getTask(id: string): Promise<Task | null> {
      const res = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(id)}`, {
        headers: authOnly(),
      });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      const row = (await res.json()) as TaskDbRow;
      return taskFromDbRow(row);
    },

    async putTask(task: Task): Promise<void> {
      const row = taskToDbRow(task, 0, null);
      const res = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify(row),
      });
      if (!res.ok) throw new Error(`putTask failed: HTTP ${res.status}`);
    },

    async deleteTask(id: string): Promise<void> {
      const res = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authOnly(),
      });
      if (!res.ok) throw new Error(`deleteTask failed: HTTP ${res.status}`);
    },

    async getStreamDay(dateKey: string): Promise<StreamEntry[]> {
      const res = await fetch(`${baseUrl}/api/stream?date=${encodeURIComponent(dateKey)}`, {
        headers: authOnly(),
      });
      if (!res.ok) return [];
      const rows = (await res.json()) as string[];
      return rows.map((s) => streamEntryFromDbRow(JSON.parse(s) as StreamEntryDbRow));
    },

    async getRecentStream(days = 14): Promise<StreamEntry[]> {
      const res = await fetch(
        `${baseUrl}/api/stream/recent?days=${encodeURIComponent(String(days))}`,
        { headers: authOnly() },
      );
      if (!res.ok) return [];
      const rows = (await res.json()) as string[];
      return rows.map((s) => streamEntryFromDbRow(JSON.parse(s) as StreamEntryDbRow));
    },

    async listStreamDateKeys(): Promise<string[]> {
      const res = await fetch(`${baseUrl}/api/stream/dates`, { headers: authOnly() });
      if (!res.ok) return [];
      return (await res.json()) as string[];
    },

    async searchStreamEntries(query: string, limit = 200): Promise<StreamEntry[]> {
      const q = query.trim();
      if (!q) return [];
      const lim = Math.min(Math.max(1, limit), 500);
      const res = await fetch(
        `${baseUrl}/api/stream/search?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(lim))}`,
        { headers: authOnly() },
      );
      if (!res.ok) return [];
      const rows = (await res.json()) as string[];
      return rows.map((s) => streamEntryFromDbRow(JSON.parse(s) as StreamEntryDbRow));
    },

    async putStreamEntry(entry: StreamEntry): Promise<void> {
      const row = streamEntryToDbRow(entry, 0, null);
      const res = await fetch(`${baseUrl}/api/stream/${encodeURIComponent(entry.id)}`, {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify(row),
      });
      if (!res.ok) throw new Error(`putStreamEntry failed: HTTP ${res.status}`);
    },

    async deleteStreamEntry(id: string): Promise<void> {
      const res = await fetch(`${baseUrl}/api/stream/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authOnly(),
      });
      if (!res.ok) throw new Error(`deleteStreamEntry failed: HTTP ${res.status}`);
    },

    async getSetting(key: string): Promise<string | null> {
      try {
        const res = await fetch(`${baseUrl}/api/settings?key=${encodeURIComponent(key)}`, {
          headers: jsonHeaders(),
        });
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
          return {
            allow_attachments: true,
            max_size: 10 * 1024 * 1024,
            storage: 'local',
            image_host_url: '',
          };
        }
        return res.json();
      } catch {
        return {
          allow_attachments: true,
          max_size: 10 * 1024 * 1024,
          storage: 'local',
          image_host_url: '',
        };
      }
    },
  };
}
