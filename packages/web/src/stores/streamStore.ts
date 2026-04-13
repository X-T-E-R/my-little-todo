import { type Attachment, type StreamEntry, type StreamEntryType, formatDateKey } from '@my-little-todo/core';
import type { DdlType } from '@my-little-todo/core';
import { create } from 'zustand';
import i18n from '../locales';
import { getDataStore } from '../storage/dataStore';
import {
  addStreamEntry,
  loadRecentDays,
  searchStreamEntries,
  updateStreamEntry,
} from '../storage/streamRepo';
import { createTaskForEntry } from '../storage/taskRepo';
import { NO_ROLE_FILTER } from './roleStore';

interface StreamState {
  entries: StreamEntry[];
  /** How many calendar days back `entries` covers (for "load more"). */
  daysLoaded: number;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  searchResults: StreamEntry[] | null;

  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  runSearch: (query: string) => Promise<void>;
  clearSearch: () => void;
  addEntry: (
    content: string,
    saveAsTask?: boolean,
    meta?: {
      ddl?: Date;
      ddlType?: DdlType;
      tags?: string[];
      body?: string;
      roleId?: string;
      entryType?: StreamEntryType;
      attachments?: Attachment[];
    },
  ) => Promise<StreamEntry>;
  updateEntry: (entry: StreamEntry) => Promise<void>;
  deleteEntry: (entryId: string) => Promise<void>;
  /** Auto-create a linked Task if the entry doesn't already have one. Returns the task ID. */
  enrichEntry: (entryId: string) => Promise<string>;
  /** Change an entry's type (spark <-> task). */
  setEntryType: (entryId: string, entryType: StreamEntryType) => Promise<void>;
  addSubtaskToEntry: (entryId: string, title: string) => Promise<void>;
  setEntryDdl: (entryId: string, ddl: Date, ddlType?: DdlType) => Promise<void>;
  /** Keep stream card role in sync when task roles change (primary = first id). */
  syncStreamEntryRoleForTask: (taskId: string, primaryRoleId: string | undefined) => Promise<void>;
}

let _streamLoadPromise: Promise<void> | null = null;

function resolveRoleIdForNewEntry(
  metaRoleId: string | undefined,
  currentFilter: string | null,
): string | undefined {
  if (metaRoleId !== undefined) return metaRoleId;
  if (currentFilter && currentFilter !== NO_ROLE_FILTER) return currentFilter;
  return undefined;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  entries: [],
  daysLoaded: 14,
  loading: false,
  error: null,
  searchQuery: '',
  searchResults: null,

  load: async () => {
    if (_streamLoadPromise) return _streamLoadPromise;
    _streamLoadPromise = (async () => {
      set({ loading: true, error: null, searchResults: null, searchQuery: '' });
      try {
        const days = 14;
        const entries = await loadRecentDays(days);
        set({ entries, daysLoaded: days, loading: false });
      } catch (e) {
        if (get().entries.length === 0) {
          set({ error: String(e), loading: false });
        } else {
          set({ loading: false });
        }
      } finally {
        _streamLoadPromise = null;
      }
    })();
    return _streamLoadPromise;
  },

  loadMore: async () => {
    const prev = get().daysLoaded;
    const nextDays = prev + 14;
    set({ loading: true });
    try {
      const entries = await loadRecentDays(nextDays);
      set({ entries, daysLoaded: nextDays, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  runSearch: async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      set({ searchQuery: '', searchResults: null });
      return;
    }
    set({ loading: true, error: null });
    try {
      const searchResults = await searchStreamEntries(trimmed, 200);
      set({ searchQuery: trimmed, searchResults, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  clearSearch: () => set({ searchQuery: '', searchResults: null }),

  addEntry: async (
    content: string,
    saveAsTask = false,
    meta?: {
      ddl?: Date;
      ddlType?: DdlType;
      tags?: string[];
      body?: string;
      roleId?: string;
      entryType?: StreamEntryType;
      attachments?: Attachment[];
    },
  ) => {
    const { useRoleStore } = await import('./roleStore');
    const roleId = resolveRoleIdForNewEntry(meta?.roleId, useRoleStore.getState().currentRoleId);
    const entryType: StreamEntryType = meta?.entryType ?? (saveAsTask ? 'task' : 'spark');

    const tempId = `_temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: StreamEntry = {
      id: tempId,
      content,
      timestamp: new Date(),
      tags: content.match(/#[^\s]+/g)?.map((t) => t.slice(1)) ?? [],
      entryType,
      roleId,
      attachments: meta?.attachments ?? [],
    };
    set((state) => ({ entries: [...state.entries, optimistic] }));

    try {
      const entry = await addStreamEntry(content, roleId, entryType, meta?.attachments ?? []);
      set((state) => ({
        entries: state.entries.map((e) => (e.id === tempId ? entry : e)),
      }));

      if (saveAsTask) {
        const canonicalEntry = {
          ...entry,
          content: meta?.body ?? content,
          tags: meta?.tags ?? entry.tags,
          entryType: 'task' as const,
        };
        if (
          canonicalEntry.content !== entry.content ||
          canonicalEntry.entryType !== entry.entryType ||
          canonicalEntry.tags !== entry.tags
        ) {
          await updateStreamEntry(canonicalEntry);
        }
        const task = await createTaskForEntry(canonicalEntry, {
          ddl: meta?.ddl,
          ddlType: meta?.ddlType,
          titleCustomized: false,
        });
        const finalEntry: StreamEntry = {
          ...canonicalEntry,
          extractedTaskId: task.id,
          entryType: 'task',
        };
        set((state) => ({
          entries: state.entries.map((e) => (e.id === entry.id ? finalEntry : e)),
        }));
        const { useTaskStore } = await import('./taskStore');
        useTaskStore.setState((state) =>
          state.tasks.find((t) => t.id === task.id) ? state : { tasks: [...state.tasks, task] },
        );
        return finalEntry;
      }

      return entry;
    } catch (err) {
      set((state) => ({ entries: state.entries.filter((e) => e.id !== tempId) }));
      throw err;
    }
  },

  updateEntry: async (entry: StreamEntry) => {
    await updateStreamEntry(entry);
    set((state) => ({
      entries: state.entries.map((e) => (e.id === entry.id ? entry : e)),
      searchResults: state.searchResults
        ? state.searchResults.map((e) => (e.id === entry.id ? entry : e))
        : null,
    }));
  },

  deleteEntry: async (entryId: string) => {
    const prevEntries = get().entries;
    const prevSearch = get().searchResults;
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== entryId),
      searchResults: state.searchResults
        ? state.searchResults.filter((e) => e.id !== entryId)
        : null,
    }));

    try {
      const { deleteStreamEntry } = await import('../storage/streamRepo');
      await deleteStreamEntry(entryId);
    } catch {
      set({ entries: prevEntries, searchResults: prevSearch });
    }
  },

  enrichEntry: async (entryId: string) => {
    const entry = get().entries.find((e) => e.id === entryId);
    if (!entry) throw new Error('Entry not found');
    if (entry.extractedTaskId) return entry.extractedTaskId;

    const task = await createTaskForEntry(
      {
        ...entry,
        entryType: 'task',
      },
      {
        titleCustomized: false,
      },
    );

    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === entryId ? { ...e, extractedTaskId: task.id, entryType: 'task' } : e,
      ),
    }));

    const { useTaskStore } = await import('./taskStore');
    const ts = useTaskStore.getState();
    if (!ts.tasks.find((t) => t.id === task.id)) {
      useTaskStore.setState({ tasks: [...ts.tasks, task] });
    }

    return task.id;
  },

  setEntryType: async (entryId: string, entryType: StreamEntryType) => {
    const entry = get().entries.find((e) => e.id === entryId);
    if (!entry) return;

    if (entryType === 'task' && !entry.extractedTaskId) {
      await get().enrichEntry(entryId);
    }

    if (entryType !== 'task' && entry.extractedTaskId) {
      await getDataStore().deleteTaskFacet?.(entry.extractedTaskId);
      const { useTaskStore } = await import('./taskStore');
      useTaskStore.setState((state) => ({
        tasks: state.tasks.filter((task) => task.id !== entry.extractedTaskId),
      }));
    }

    const updated = { ...entry, entryType };
    await updateStreamEntry(updated);
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === entryId
          ? {
              ...e,
              entryType,
              extractedTaskId: entryType === 'task' ? e.extractedTaskId : undefined,
            }
          : e,
      ),
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

  syncStreamEntryRoleForTask: async (taskId: string, primaryRoleId: string | undefined) => {
    const entry = get().entries.find((e) => e.extractedTaskId === taskId);
    if (!entry) return;
    if (entry.roleId === primaryRoleId) return;
    await get().updateEntry({ ...entry, roleId: primaryRoleId });
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
      label:
        dateKey === today
          ? i18n.t('dates.Today', { ns: 'common' })
          : dateKey === yesterday
            ? i18n.t('dates.Yesterday', { ns: 'common' })
            : dateKey,
      entries: items.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    }));

  return result;
}
