import {
  type StreamEntryDbRow,
  type TaskDbRow,
  streamEntryFromDbRow,
  streamEntryToDbRow,
  taskFromDbRow,
  taskToDbRow,
} from '@my-little-todo/core';
import type {
  StreamEntry,
  Task,
  ThinkSession,
  WindowContext,
  WorkThread,
  WorkThreadEvent,
} from '@my-little-todo/core';
import { getAuthToken } from '../stores/authStore';
import type { AttachmentConfig, UploadResult } from './blobApi';
import type {
  AuditEventRecord,
  DataStore,
  EntityRevisionRecord,
  HistoryEntityType,
} from './dataStore';
import { getPrimaryRoleId, hydrateTaskWithEntry } from './taskEntryBridge';
import { deserializeWorkThread, deserializeWorkThreadEvent } from './workThreadStorage';

function normalizeAuditEventRecord(value: unknown): AuditEventRecord {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id),
    groupId:
      row.group_id != null
        ? String(row.group_id)
        : row.groupId != null
          ? String(row.groupId)
          : null,
    userId: String(row.user_id ?? row.userId ?? ''),
    entityType: String(row.entity_type ?? row.entityType) as HistoryEntityType,
    entityId: String(row.entity_id ?? row.entityId ?? ''),
    entityVersion: Number(row.entity_version ?? row.entityVersion ?? 0),
    globalVersion: Number(row.global_version ?? row.globalVersion ?? 0),
    action: String(row.action ?? ''),
    sourceKind: String(row.source_kind ?? row.sourceKind ?? ''),
    actorType: String(row.actor_type ?? row.actorType ?? ''),
    actorId: String(row.actor_id ?? row.actorId ?? ''),
    occurredAt: Number(row.occurred_at ?? row.occurredAt ?? 0),
    summaryJson:
      row.summary_json != null
        ? String(row.summary_json)
        : row.summaryJson != null
          ? String(row.summaryJson)
          : null,
  };
}

function normalizeEntityRevisionRecord(value: unknown): EntityRevisionRecord {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id),
    eventId: String(row.event_id ?? row.eventId ?? ''),
    groupId:
      row.group_id != null
        ? String(row.group_id)
        : row.groupId != null
          ? String(row.groupId)
          : null,
    userId: String(row.user_id ?? row.userId ?? ''),
    entityType: String(row.entity_type ?? row.entityType) as HistoryEntityType,
    entityId: String(row.entity_id ?? row.entityId ?? ''),
    entityVersion: Number(row.entity_version ?? row.entityVersion ?? 0),
    globalVersion: Number(row.global_version ?? row.globalVersion ?? 0),
    op: String(row.op ?? 'upsert') as EntityRevisionRecord['op'],
    changedAt: Number(row.changed_at ?? row.changedAt ?? 0),
    snapshotJson: String(row.snapshot_json ?? row.snapshotJson ?? '{}'),
  };
}

const THINK_SESSIONS_KV = 'think-sessions:v1';
const WORK_THREADS_KV = 'work-threads:v1';
const WORK_THREAD_EVENTS_KV = 'work-thread-events:v1';

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

  const fetchTaskRows = async (): Promise<TaskDbRow[]> => {
    const res = await fetch(`${baseUrl}/api/tasks`, { headers: authOnly() });
    if (!res.ok) return [];
    const rows = (await res.json()) as string[];
    return rows.map((s) => JSON.parse(s) as TaskDbRow);
  };

  const fetchAllStreamEntries = async (): Promise<StreamEntry[]> => {
    const res = await fetch(`${baseUrl}/api/stream/all`, { headers: authOnly() });
    if (!res.ok) return [];
    const rows = (await res.json()) as string[];
    return rows.map((s) => streamEntryFromDbRow(JSON.parse(s) as StreamEntryDbRow));
  };

  const hydrateTasks = async (taskRows: TaskDbRow[]): Promise<Task[]> => {
    if (taskRows.length === 0) return [];
    const entries = await fetchAllStreamEntries();
    const entriesById = new Map(entries.map((entry) => [entry.id, entry] as const));
    return taskRows.map((row) =>
      hydrateTaskWithEntry(
        taskFromDbRow(row),
        entriesById.get(row.id) ?? (row.source_stream_id ? entriesById.get(row.source_stream_id) : undefined),
      ),
    );
  };

  const attachTaskLinks = async (entries: StreamEntry[]): Promise<StreamEntry[]> => {
    if (entries.length === 0) return entries;
    const taskRows = await fetchTaskRows();
    const entryToTaskId = new Map<string, string>();
    for (const row of taskRows) {
      entryToTaskId.set(row.source_stream_id ?? row.id, row.id);
    }
    return entries.map((entry) => ({
      ...entry,
      extractedTaskId: entryToTaskId.get(entry.id),
    }));
  };

  return {
    async getAllTasks(): Promise<Task[]> {
      return hydrateTasks(await fetchTaskRows());
    },

    async getTask(id: string): Promise<Task | null> {
      const res = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(id)}`, {
        headers: authOnly(),
      });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      const row = (await res.json()) as TaskDbRow;
      const [task] = await hydrateTasks([row]);
      return task ?? null;
    },

    async putTask(task: Task): Promise<void> {
      const streamRow = streamEntryToDbRow(
        {
          id: task.id,
          content: task.body,
          timestamp: task.createdAt,
          tags: task.tags,
          attachments: [],
          roleId: getPrimaryRoleId(task),
          entryType: 'task',
        },
        0,
        null,
      );
      const streamRes = await fetch(`${baseUrl}/api/stream/${encodeURIComponent(task.id)}`, {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify(streamRow),
      });
      if (!streamRes.ok) throw new Error(`putStreamEntry failed: HTTP ${streamRes.status}`);

      const row = taskToDbRow(task, 0, null);
      const res = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify(row),
      });
      if (!res.ok) throw new Error(`putTask failed: HTTP ${res.status}`);
    },

    async deleteTask(id: string): Promise<void> {
      const [taskRes, streamRes] = await Promise.all([
        fetch(`${baseUrl}/api/tasks/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: authOnly(),
        }),
        fetch(`${baseUrl}/api/stream/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: authOnly(),
        }),
      ]);
      if (!taskRes.ok) throw new Error(`deleteTask failed: HTTP ${taskRes.status}`);
      if (!streamRes.ok) throw new Error(`deleteStreamEntry failed: HTTP ${streamRes.status}`);
    },

    async deleteTaskFacet(id: string): Promise<void> {
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
      return attachTaskLinks(rows.map((s) => streamEntryFromDbRow(JSON.parse(s) as StreamEntryDbRow)));
    },

    async getRecentStream(days = 14): Promise<StreamEntry[]> {
      const res = await fetch(
        `${baseUrl}/api/stream/recent?days=${encodeURIComponent(String(days))}`,
        { headers: authOnly() },
      );
      if (!res.ok) return [];
      const rows = (await res.json()) as string[];
      return attachTaskLinks(rows.map((s) => streamEntryFromDbRow(JSON.parse(s) as StreamEntryDbRow)));
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
      return attachTaskLinks(rows.map((s) => streamEntryFromDbRow(JSON.parse(s) as StreamEntryDbRow)));
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
      const [streamRes, taskRes] = await Promise.all([
        fetch(`${baseUrl}/api/stream/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: authOnly(),
        }),
        fetch(`${baseUrl}/api/tasks/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: authOnly(),
        }),
      ]);
      if (!streamRes.ok) throw new Error(`deleteStreamEntry failed: HTTP ${streamRes.status}`);
      if (!taskRes.ok && taskRes.status !== 404) {
        throw new Error(`deleteTask failed: HTTP ${taskRes.status}`);
      }
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

    async getBlobData(id: string) {
      const res = await fetch(`${baseUrl}/api/blobs/${id}`, { headers: authOnly() });
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      return {
        data: new Uint8Array(buffer),
        mimeType: res.headers.get('content-type') || 'application/octet-stream',
        filename: id,
      };
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

    async getAllWindowContexts(): Promise<WindowContext[]> {
      return [];
    },

    async putWindowContext(_ctx: WindowContext): Promise<void> {
      /* server-side window contexts not implemented */
    },

    async deleteWindowContext(_id: string): Promise<void> {
      /* server-side window contexts not implemented */
    },

    async saveThinkSession(session: ThinkSession): Promise<void> {
      const all = await this.listThinkSessions(5000);
      const idx = all.findIndex((s) => s.id === session.id);
      const next =
        idx >= 0 ? [...all.slice(0, idx), session, ...all.slice(idx + 1)] : [session, ...all];
      await this.putSetting(THINK_SESSIONS_KV, JSON.stringify(next));
    },

    async getThinkSession(id: string): Promise<ThinkSession | null> {
      const all = await this.listThinkSessions(5000);
      return all.find((s) => s.id === id) ?? null;
    },

    async listThinkSessions(limit = 200): Promise<ThinkSession[]> {
      try {
        const raw = await this.getSetting(THINK_SESSIONS_KV);
        if (!raw) return [];
        const arr = JSON.parse(raw) as ThinkSession[];
        if (!Array.isArray(arr)) return [];
        arr.sort((a, b) => b.updatedAt - a.updatedAt);
        const lim = Math.min(Math.max(1, limit), 500);
        return arr.slice(0, lim);
      } catch {
        return [];
      }
    },

    async deleteThinkSession(id: string): Promise<void> {
      const all = await this.listThinkSessions(5000);
      await this.putSetting(THINK_SESSIONS_KV, JSON.stringify(all.filter((s) => s.id !== id)));
    },

    async saveWorkThread(thread: WorkThread): Promise<void> {
      const all = await this.listWorkThreads(5000);
      const idx = all.findIndex((t) => t.id === thread.id);
      const next =
        idx >= 0 ? [...all.slice(0, idx), thread, ...all.slice(idx + 1)] : [thread, ...all];
      await this.putSetting(WORK_THREADS_KV, JSON.stringify(next));
    },

    async getWorkThread(id: string): Promise<WorkThread | null> {
      const all = await this.listWorkThreads(5000);
      return all.find((thread) => thread.id === id) ?? null;
    },

    async listWorkThreads(limit = 200): Promise<WorkThread[]> {
      try {
        const raw = await this.getSetting(WORK_THREADS_KV);
        if (!raw) return [];
        const arr = JSON.parse(raw) as unknown[];
        if (!Array.isArray(arr)) return [];
        const normalized = arr.map((item) => deserializeWorkThread(item));
        normalized.sort((a, b) => b.updatedAt - a.updatedAt);
        const lim = Math.min(Math.max(1, limit), 500);
        return normalized.slice(0, lim);
      } catch {
        return [];
      }
    },

    async deleteWorkThread(id: string): Promise<void> {
      const [threads, events] = await Promise.all([
        this.listWorkThreads(5000),
        this.listWorkThreadEvents(id, 5000),
      ]);
      await this.putSetting(
        WORK_THREADS_KV,
        JSON.stringify(threads.filter((thread) => thread.id !== id)),
      );
      if (events.length > 0) {
        const allEventsRaw = await this.getSetting(WORK_THREAD_EVENTS_KV);
        const allEvents = allEventsRaw ? (JSON.parse(allEventsRaw) as WorkThreadEvent[]) : [];
        await this.putSetting(
          WORK_THREAD_EVENTS_KV,
          JSON.stringify(allEvents.filter((event) => event.threadId !== id)),
        );
      }
    },

    async appendWorkThreadEvent(event: WorkThreadEvent): Promise<void> {
      const raw = await this.getSetting(WORK_THREAD_EVENTS_KV);
      const base = raw ? ((JSON.parse(raw) as WorkThreadEvent[]) ?? []) : [];
      const deduped = base.filter((item) => item.id !== event.id);
      deduped.push(event);
      deduped.sort((a, b) => b.createdAt - a.createdAt);
      await this.putSetting(WORK_THREAD_EVENTS_KV, JSON.stringify(deduped.slice(0, 5000)));
    },

    async listWorkThreadEvents(threadId: string, limit = 200): Promise<WorkThreadEvent[]> {
      try {
        const raw = await this.getSetting(WORK_THREAD_EVENTS_KV);
        if (!raw) return [];
        const arr = JSON.parse(raw) as unknown[];
        if (!Array.isArray(arr)) return [];
        const filtered = arr
          .map((event) => deserializeWorkThreadEvent(event))
          .filter((event) => event.threadId === threadId)
          .sort((a, b) => b.createdAt - a.createdAt);
        const lim = Math.min(Math.max(1, limit), 1000);
        return filtered.slice(0, lim);
      } catch {
        return [];
      }
    },

    async listEntityRevisions(
      entityType: HistoryEntityType,
      entityId: string,
      limit = 50,
    ): Promise<EntityRevisionRecord[]> {
      const lim = Math.min(Math.max(1, limit), 500);
      const res = await fetch(
        `${baseUrl}/api/history/revisions?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&limit=${encodeURIComponent(String(lim))}`,
        { headers: authOnly() },
      );
      if (!res.ok) return [];
      const rows = (await res.json()) as unknown[];
      return rows.map(normalizeEntityRevisionRecord);
    },

    async listAuditEvents(limit = 100, filters): Promise<AuditEventRecord[]> {
      const lim = Math.min(Math.max(1, limit), 500);
      const params = new URLSearchParams({ limit: String(lim) });
      if (filters?.entityType) params.set('entityType', filters.entityType);
      if (filters?.entityId) params.set('entityId', filters.entityId);
      const res = await fetch(`${baseUrl}/api/history/events?${params.toString()}`, {
        headers: authOnly(),
      });
      if (!res.ok) return [];
      const rows = (await res.json()) as unknown[];
      return rows.map(normalizeAuditEventRecord);
    },
  };
}
