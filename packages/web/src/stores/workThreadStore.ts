import type {
  StreamEntry,
  Task,
  WorkThread,
  WorkThreadContextItem,
  WorkThreadEvent,
  WorkThreadNextAction,
  WorkThreadStatus,
  WorkThreadSuggestionKind,
} from '@my-little-todo/core';
import { displayTaskTitle } from '@my-little-todo/core';
import { create } from 'zustand';
import { getDataStore } from '../storage/dataStore';
import { formatTaskRefMarkdown } from '../utils/taskRefs';
import { generateWorkThreadSuggestion, parseSuggestedNextSteps } from '../utils/workThreadAi';
import { useStreamStore } from './streamStore';
import { useTaskStore } from './taskStore';

function summarizeText(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}

function defaultThreadTitle(): string {
  return `Thread ${new Date().toLocaleDateString()}`;
}

function createBaseThread(opts?: {
  title?: string;
  roleId?: string;
  docMarkdown?: string;
}): WorkThread {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: opts?.title?.trim() || defaultThreadTitle(),
    status: 'active',
    roleId: opts?.roleId,
    docMarkdown: opts?.docMarkdown ?? '',
    contextItems: [],
    nextActions: [],
    suggestions: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createEvent(
  threadId: string,
  type: WorkThreadEvent['type'],
  actor: WorkThreadEvent['actor'],
  title: string,
  detailMarkdown?: string,
  payload?: Record<string, unknown>,
): WorkThreadEvent {
  return {
    id: crypto.randomUUID(),
    threadId,
    type,
    actor,
    title,
    detailMarkdown,
    payload,
    createdAt: Date.now(),
  };
}

type ExternalTargetMode = 'current' | 'new';

interface WorkThreadState {
  threads: WorkThread[];
  currentThread: WorkThread | null;
  currentEvents: WorkThreadEvent[];
  loading: boolean;
  aiBusy: boolean;
  saveError: string | null;

  loadThreads: () => Promise<void>;
  showThreadList: () => Promise<void>;
  openThread: (id: string) => Promise<void>;
  createThread: (opts?: {
    title?: string;
    roleId?: string;
    docMarkdown?: string;
  }) => Promise<WorkThread>;
  deleteThread: (id: string) => Promise<void>;
  renameThread: (title: string) => Promise<void>;
  setStatus: (status: WorkThreadStatus) => Promise<void>;
  updateDoc: (markdown: string) => void;
  flushSave: () => Promise<void>;
  saveCheckpoint: (title?: string) => Promise<void>;

  addManualContext: (title: string, content?: string) => Promise<void>;
  addLinkContext: (title: string, url: string) => Promise<void>;
  addTaskToThread: (task: Task, mode?: ExternalTargetMode) => Promise<void>;
  addStreamToThread: (entry: StreamEntry, mode?: ExternalTargetMode) => Promise<void>;

  addDecision: (title: string, detailMarkdown?: string) => Promise<void>;
  addNextAction: (text: string, source?: 'user' | 'ai') => Promise<void>;
  toggleNextActionDone: (id: string) => Promise<void>;
  createTaskFromNextAction: (id: string) => Promise<void>;

  runAiSuggestion: (kind: WorkThreadSuggestionKind) => Promise<void>;
  applySuggestionToDoc: (id: string) => Promise<void>;
  applySuggestionToNextActions: (id: string) => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let loadPromise: Promise<void> | null = null;

async function persistThread(thread: WorkThread): Promise<void> {
  await getDataStore().saveWorkThread(thread);
}

async function persistEvent(event: WorkThreadEvent): Promise<void> {
  await getDataStore().appendWorkThreadEvent(event);
}

export const useWorkThreadStore = create<WorkThreadState>((set, get) => ({
  threads: [],
  currentThread: null,
  currentEvents: [],
  loading: false,
  aiBusy: false,
  saveError: null,

  loadThreads: async () => {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      set({ loading: true });
      try {
        const threads = await getDataStore().listWorkThreads(200);
        set({ threads, loading: false });
      } catch (error) {
        set({ loading: false, saveError: String(error) });
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  },

  showThreadList: async () => {
    await get().saveCheckpoint('Saved checkpoint');
    await get().loadThreads();
    set({ currentThread: null, currentEvents: [] });
  },

  openThread: async (id) => {
    const [thread, events] = await Promise.all([
      getDataStore().getWorkThread(id),
      getDataStore().listWorkThreadEvents(id, 300),
    ]);
    if (!thread) return;
    set({ currentThread: thread, currentEvents: events });
    await get().loadThreads();
  },

  createThread: async (opts) => {
    const thread = createBaseThread(opts);
    await persistThread(thread);
    const event = createEvent(thread.id, 'created', 'user', 'Created thread');
    await persistEvent(event);
    set((state) => ({
      threads: [thread, ...state.threads.filter((item) => item.id !== thread.id)],
      currentThread: thread,
      currentEvents: [event],
      saveError: null,
    }));
    return thread;
  },

  deleteThread: async (id) => {
    await getDataStore().deleteWorkThread(id);
    set((state) => ({
      threads: state.threads.filter((thread) => thread.id !== id),
      currentThread: state.currentThread?.id === id ? null : state.currentThread,
      currentEvents: state.currentThread?.id === id ? [] : state.currentEvents,
    }));
  },

  renameThread: async (title) => {
    const current = get().currentThread;
    const nextTitle = title.trim();
    if (!current || !nextTitle || nextTitle === current.title) return;
    const next = { ...current, title: nextTitle, updatedAt: Date.now() };
    await persistThread(next);
    const event = createEvent(next.id, 'renamed', 'user', `Renamed thread to ${nextTitle}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: state.threads.map((thread) => (thread.id === next.id ? next : thread)),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  setStatus: async (status) => {
    const current = get().currentThread;
    if (!current || current.status === status) return;
    const next = { ...current, status, updatedAt: Date.now() };
    await persistThread(next);
    const event = createEvent(next.id, 'status_changed', 'user', `Status changed to ${status}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: state.threads.map((thread) => (thread.id === next.id ? next : thread)),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  updateDoc: (markdown) => {
    const current = get().currentThread;
    if (!current) return;
    const next = { ...current, docMarkdown: markdown, updatedAt: Date.now() };
    set((state) => ({
      currentThread: next,
      threads: state.threads.map((thread) => (thread.id === next.id ? next : thread)),
    }));
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void get().flushSave();
    }, 1200);
  },

  flushSave: async () => {
    const current = get().currentThread;
    if (!current) return;
    try {
      const next = { ...current, updatedAt: Date.now() };
      await persistThread(next);
      set((state) => ({
        currentThread: next,
        threads: state.threads.map((thread) => (thread.id === next.id ? next : thread)),
        saveError: null,
      }));
    } catch (error) {
      set({ saveError: String(error) });
    }
  },

  saveCheckpoint: async (title) => {
    const current = get().currentThread;
    if (!current) return;
    await get().flushSave();
    const event = createEvent(
      current.id,
      'checkpoint_saved',
      'system',
      title ?? 'Saved checkpoint',
      summarizeText(current.docMarkdown, 220) || undefined,
    );
    await persistEvent(event);
    set((state) => ({ currentEvents: [event, ...state.currentEvents] }));
  },

  addManualContext: async (title, content) => {
    const current = get().currentThread;
    if (!current || !title.trim()) return;
    const item: WorkThreadContextItem = {
      id: crypto.randomUUID(),
      kind: 'note',
      title: title.trim(),
      content: content?.trim() || undefined,
      addedAt: Date.now(),
    };
    const next = {
      ...current,
      contextItems: [item, ...current.contextItems],
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const event = createEvent(
      current.id,
      'context_added',
      'user',
      `Added note context: ${item.title}`,
      item.content,
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: state.threads.map((thread) => (thread.id === next.id ? next : thread)),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  addLinkContext: async (title, url) => {
    const current = get().currentThread;
    if (!current || !title.trim() || !url.trim()) return;
    const item: WorkThreadContextItem = {
      id: crypto.randomUUID(),
      kind: 'link',
      title: title.trim(),
      content: url.trim(),
      addedAt: Date.now(),
    };
    const next = {
      ...current,
      contextItems: [item, ...current.contextItems],
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const event = createEvent(
      current.id,
      'context_added',
      'user',
      `Added link context: ${item.title}`,
      item.content,
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: state.threads.map((thread) => (thread.id === next.id ? next : thread)),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  addTaskToThread: async (task, mode = 'current') => {
    const current = get().currentThread;
    const roleId = task.roleId;
    const thread =
      mode === 'new' || !current
        ? await get().createThread({
            title: displayTaskTitle(task),
            roleId,
            docMarkdown: `## Focus\n\n${formatTaskRefMarkdown(task)}\n`,
          })
        : current;
    const existing = thread.contextItems.find(
      (item) => item.kind === 'task' && item.refId === task.id,
    );
    if (existing) {
      await get().openThread(thread.id);
      return;
    }
    const item: WorkThreadContextItem = {
      id: crypto.randomUUID(),
      kind: 'task',
      refId: task.id,
      title: displayTaskTitle(task),
      content: task.body ? summarizeText(task.body, 180) : undefined,
      addedAt: Date.now(),
    };
    const next = {
      ...thread,
      contextItems: [item, ...thread.contextItems],
      updatedAt: Date.now(),
      docMarkdown:
        mode === 'new' && thread.docMarkdown.includes(formatTaskRefMarkdown(task))
          ? thread.docMarkdown
          : `${thread.docMarkdown.trim()}\n\n${formatTaskRefMarkdown(task)}`.trim(),
    };
    await persistThread(next);
    const event = createEvent(thread.id, 'task_linked', 'user', `Linked task: ${item.title}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: [next, ...state.threads.filter((itemThread) => itemThread.id !== next.id)],
      currentEvents: [event, ...state.currentEvents.filter((entry) => entry.threadId === next.id)],
    }));
  },

  addStreamToThread: async (entry, mode = 'current') => {
    const current = get().currentThread;
    const title = summarizeText(entry.content, 64) || 'Stream note';
    const thread =
      mode === 'new' || !current
        ? await get().createThread({
            title,
            roleId: entry.roleId,
            docMarkdown: `## Notes from stream\n\n> ${summarizeText(entry.content, 220)}\n`,
          })
        : current;
    const existing = thread.contextItems.find(
      (item) => item.kind === 'stream' && item.refId === entry.id,
    );
    if (existing) {
      await get().openThread(thread.id);
      return;
    }
    const item: WorkThreadContextItem = {
      id: crypto.randomUUID(),
      kind: 'stream',
      refId: entry.id,
      title,
      content: summarizeText(entry.content, 220),
      addedAt: Date.now(),
    };
    const next = {
      ...thread,
      contextItems: [item, ...thread.contextItems],
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const event = createEvent(
      thread.id,
      'context_added',
      'user',
      `Added stream context: ${item.title}`,
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: [next, ...state.threads.filter((itemThread) => itemThread.id !== next.id)],
      currentEvents: [
        event,
        ...state.currentEvents.filter((timeline) => timeline.threadId === next.id),
      ],
    }));
  },

  addDecision: async (title, detailMarkdown) => {
    const current = get().currentThread;
    if (!current || !title.trim()) return;
    const event = createEvent(
      current.id,
      'decision_recorded',
      'user',
      title.trim(),
      detailMarkdown?.trim() || undefined,
    );
    await persistEvent(event);
    set((state) => ({ currentEvents: [event, ...state.currentEvents] }));
  },

  addNextAction: async (text, source = 'user') => {
    const current = get().currentThread;
    if (!current || !text.trim()) return;
    const action: WorkThreadNextAction = {
      id: crypto.randomUUID(),
      text: text.trim(),
      done: false,
      source,
      createdAt: Date.now(),
    };
    const next = {
      ...current,
      nextActions: [action, ...current.nextActions],
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const event = createEvent(
      current.id,
      'next_action_added',
      source,
      `Added next action: ${action.text}`,
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: state.threads.map((thread) => (thread.id === next.id ? next : thread)),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  toggleNextActionDone: async (id) => {
    const current = get().currentThread;
    if (!current) return;
    const next = {
      ...current,
      nextActions: current.nextActions.map((action) =>
        action.id === id ? { ...action, done: !action.done } : action,
      ),
      updatedAt: Date.now(),
    };
    await persistThread(next);
    set((state) => ({
      currentThread: next,
      threads: state.threads.map((thread) => (thread.id === next.id ? next : thread)),
    }));
  },

  createTaskFromNextAction: async (id) => {
    const current = get().currentThread;
    if (!current) return;
    const action = current.nextActions.find((item) => item.id === id);
    if (!action || action.linkedTaskId) return;
    const createdTask = await useTaskStore
      .getState()
      .createTask(action.text, { roleId: current.roleId, body: `Source thread: ${current.title}` });
    const nextActions = current.nextActions.map((item) =>
      item.id === id ? { ...item, linkedTaskId: createdTask.id, done: true } : item,
    );
    const next = { ...current, nextActions, updatedAt: Date.now() };
    await persistThread(next);
    const event = createEvent(
      current.id,
      'task_created',
      'user',
      `Created task from thread: ${displayTaskTitle(createdTask)}`,
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: state.threads.map((thread) => (thread.id === next.id ? next : thread)),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  runAiSuggestion: async (kind) => {
    const current = get().currentThread;
    if (!current) return;
    set({ aiBusy: true });
    try {
      const suggestion = await generateWorkThreadSuggestion(
        kind,
        current,
        useTaskStore.getState().tasks,
      );
      const next = {
        ...current,
        suggestions: [suggestion, ...(current.suggestions ?? [])],
        updatedAt: Date.now(),
      };
      await persistThread(next);
      const event = createEvent(
        current.id,
        'ai_suggested',
        'ai',
        suggestion.title,
        suggestion.content,
        {
          kind,
        },
      );
      await persistEvent(event);
      set((state) => ({
        currentThread: next,
        threads: state.threads.map((thread) => (thread.id === next.id ? next : thread)),
        currentEvents: [event, ...state.currentEvents],
        aiBusy: false,
      }));
    } catch (error) {
      set({ aiBusy: false, saveError: String(error) });
    }
  },

  applySuggestionToDoc: async (id) => {
    const current = get().currentThread;
    if (!current) return;
    const suggestion = (current.suggestions ?? []).find((item) => item.id === id);
    if (!suggestion) return;
    const next = {
      ...current,
      docMarkdown: `${current.docMarkdown.trim()}\n\n${suggestion.content}`.trim(),
      suggestions: (current.suggestions ?? []).map((item) =>
        item.id === id ? { ...item, applied: true } : item,
      ),
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const event = createEvent(
      current.id,
      'ai_applied',
      'user',
      `Inserted AI suggestion: ${suggestion.title}`,
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: state.threads.map((thread) => (thread.id === next.id ? next : thread)),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  applySuggestionToNextActions: async (id) => {
    const current = get().currentThread;
    if (!current) return;
    const suggestion = (current.suggestions ?? []).find((item) => item.id === id);
    if (!suggestion) return;
    const steps = parseSuggestedNextSteps(suggestion.content);
    if (steps.length === 0) return;
    const appended = steps.map<WorkThreadNextAction>((step) => ({
      id: crypto.randomUUID(),
      text: step,
      done: false,
      source: 'ai',
      createdAt: Date.now(),
    }));
    const next = {
      ...current,
      nextActions: [...appended, ...current.nextActions],
      suggestions: (current.suggestions ?? []).map((item) =>
        item.id === id ? { ...item, applied: true } : item,
      ),
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const event = createEvent(
      current.id,
      'ai_applied',
      'user',
      `Applied AI next steps: ${suggestion.title}`,
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: state.threads.map((thread) => (thread.id === next.id ? next : thread)),
      currentEvents: [event, ...state.currentEvents],
    }));
  },
}));

export function getRecentStreamCandidates(limit = 12): StreamEntry[] {
  return [...useStreamStore.getState().entries]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}
