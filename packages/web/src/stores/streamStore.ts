import type { StreamEntry, StreamEntryType } from '@my-little-todo/core';
import type { DdlType } from '@my-little-todo/core';
import { formatDateKey } from '@my-little-todo/core';
import i18n from '../locales';
import { create } from 'zustand';
import {
  addStreamEntry,
  linkEntryToTask,
  loadRecentDays,
  updateStreamEntry,
} from '../storage/streamRepo';
import { createTask } from '../storage/taskRepo';

interface StreamState {
  entries: StreamEntry[];
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  addEntry: (content: string, saveAsTask?: boolean, meta?: { ddl?: Date; ddlType?: DdlType; tags?: string[] }) => Promise<StreamEntry>;
  updateEntry: (entry: StreamEntry) => Promise<void>;
  deleteEntry: (entryId: string) => Promise<void>;
  /** Auto-create a linked Task if the entry doesn't already have one. Returns the task ID. */
  enrichEntry: (entryId: string) => Promise<string>;
  /** Change an entry's type (spark <-> task). */
  setEntryType: (entryId: string, entryType: StreamEntryType) => Promise<void>;
  addSubtaskToEntry: (entryId: string, title: string) => Promise<void>;
  setEntryDdl: (entryId: string, ddl: Date, ddlType?: DdlType) => Promise<void>;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  entries: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const entries = await loadRecentDays(14);
      set({ entries, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  addEntry: async (content: string, saveAsTask = false, meta?: { ddl?: Date; ddlType?: DdlType; tags?: string[] }) => {
    const { useRoleStore } = await import('./roleStore');
    const roleId = useRoleStore.getState().currentRoleId ?? undefined;
    const entryType: StreamEntryType = saveAsTask ? 'task' : 'spark';
    const entry = await addStreamEntry(content, roleId, entryType);
    set((state) => ({
      entries: [...state.entries, entry],
    }));

    if (saveAsTask) {
      const task = await createTask(content.slice(0, 80).trim(), {
        sourceStreamId: entry.id,
        tags: meta?.tags ?? entry.tags,
        roleId: entry.roleId,
        body: content,
        ddl: meta?.ddl,
        ddlType: meta?.ddlType,
      });
      const dateKey = formatDateKey(entry.timestamp);
      await linkEntryToTask(entry.id, dateKey, task.id);
      set((state) => ({
        entries: state.entries.map((e) =>
          e.id === entry.id ? { ...e, extractedTaskId: task.id, entryType: 'task' } : e,
        ),
      }));
      const { useTaskStore } = await import('./taskStore');
      await useTaskStore.getState().load();
    }

    return entry;
  },

  updateEntry: async (entry: StreamEntry) => {
    await updateStreamEntry(entry);
    set((state) => ({
      entries: state.entries.map((e) => (e.id === entry.id ? entry : e)),
    }));
  },

  deleteEntry: async (entryId: string) => {
    const entry = get().entries.find((e) => e.id === entryId);
    if (!entry) return;
    const dateKey = formatDateKey(entry.timestamp);
    const dayEntries = get().entries.filter(
      (e) => formatDateKey(e.timestamp) === dateKey && e.id !== entryId,
    );
    const { serializeStreamFile } = await import('@my-little-todo/core');
    const { writeFile } = await import('../storage/adapter');
    const { STREAM_DIR } = await import('@my-little-todo/core');
    const serialized = serializeStreamFile(dayEntries, dateKey);
    await writeFile(serialized, STREAM_DIR, `${dateKey}.md`);
    set((state) => ({ entries: state.entries.filter((e) => e.id !== entryId) }));
  },

  enrichEntry: async (entryId: string) => {
    const entry = get().entries.find((e) => e.id === entryId);
    if (!entry) throw new Error('Entry not found');
    if (entry.extractedTaskId) return entry.extractedTaskId;

    const task = await createTask(entry.content.slice(0, 80).trim(), {
      sourceStreamId: entryId,
      tags: entry.tags,
      roleId: entry.roleId,
      body: entry.content,
    });

    const dateKey = formatDateKey(entry.timestamp);
    await linkEntryToTask(entryId, dateKey, task.id);

    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === entryId ? { ...e, extractedTaskId: task.id } : e,
      ),
    }));

    const { useTaskStore } = await import('./taskStore');
    const ts = useTaskStore.getState();
    if (!ts.tasks.find((t) => t.id === task.id)) {
      await ts.load();
    }

    return task.id;
  },

  setEntryType: async (entryId: string, entryType: StreamEntryType) => {
    const entry = get().entries.find((e) => e.id === entryId);
    if (!entry) return;

    if (entryType === 'task' && !entry.extractedTaskId) {
      await get().enrichEntry(entryId);
    }

    const updated = { ...entry, entryType };
    await updateStreamEntry(updated);
    set((state) => ({
      entries: state.entries.map((e) => (e.id === entryId ? { ...e, entryType } : e)),
    }));
  },

  addSubtaskToEntry: async (entryId: string, title: string) => {
    const taskId = await get().enrichEntry(entryId);
    const { useTaskStore } = await import('./taskStore');
    await useTaskStore.getState().addSubtask(taskId, title);
  },

  setEntryDdl: async (entryId: string, ddl: Date, ddlType?: DdlType) => {
    const taskId = await get().enrichEntry(entryId);
    const { useTaskStore } = await import('./taskStore');
    const store = useTaskStore.getState();
    const task = store.tasks.find((t) => t.id === taskId);
    if (task) {
      await store.updateTask({ ...task, ddl, ddlType: ddlType ?? task.ddlType });
    }
  },
}));

export function groupEntriesByDate(
  entries: StreamEntry[],
): { dateKey: string; label: string; entries: StreamEntry[] }[] {
  const groups = new Map<string, StreamEntry[]>();
  for (const entry of entries) {
    const key = formatDateKey(entry.timestamp);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(entry);
  }

  const today = formatDateKey(new Date());
  const yesterday = formatDateKey(new Date(Date.now() - 86400000));

  const result = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, items]) => ({
      dateKey,
      label: dateKey === today ? i18n.t('dates.Today', { ns: 'common' }) : dateKey === yesterday ? i18n.t('dates.Yesterday', { ns: 'common' }) : dateKey,
      entries: items.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    }));

  return result;
}
