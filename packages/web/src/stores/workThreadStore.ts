import type {
  StreamEntry,
  Task,
  WorkThread,
  WorkThreadContextItem,
  WorkThreadEvent,
  WorkThreadNextAction,
  WorkThreadResumeCard,
  WorkThreadSchedulerPolicy,
  WorkThreadStatus,
  WorkThreadSuggestionKind,
  WorkThreadInterruptSource,
  WorkThreadWaitingCondition,
  WorkThreadWorkingSetItem,
} from '@my-little-todo/core';
import {
  DEFAULT_WORK_THREAD_SCHEDULER_POLICY,
  buildAutoResumeCard,
  createWorkThread,
  deriveWorkingSet,
  displayTaskTitle,
  ensureWorkThreadRuntime,
  pickWorkThreadForNow,
} from '@my-little-todo/core';
import { create } from 'zustand';
import { getDataStore } from '../storage/dataStore';
import { formatTaskRefMarkdown } from '../utils/taskRefs';
import { generateWorkThreadSuggestion, parseSuggestedNextSteps } from '../utils/workThreadAi';
import { useStreamStore } from './streamStore';
import { useTaskStore } from './taskStore';

export const WORK_THREAD_SCHEDULER_POLICY_KEY = 'think-session:thread-scheduler-policy';

function summarizeText(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}

function defaultThreadTitle(): string {
  return `Thread ${new Date().toLocaleDateString()}`;
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

interface CreateThreadOptions {
  title?: string;
  mission?: string;
  roleId?: string;
  lane?: WorkThread['lane'];
  docMarkdown?: string;
  status?: WorkThreadStatus;
}

interface WorkThreadState {
  threads: WorkThread[];
  currentThread: WorkThread | null;
  currentEvents: WorkThreadEvent[];
  loading: boolean;
  aiBusy: boolean;
  saveError: string | null;
  schedulerPolicy: WorkThreadSchedulerPolicy;

  loadThreads: () => Promise<void>;
  loadSchedulerPolicy: () => Promise<WorkThreadSchedulerPolicy>;
  setSchedulerPolicy: (policy: WorkThreadSchedulerPolicy) => Promise<void>;
  showThreadList: () => Promise<void>;
  openThread: (id: string) => Promise<void>;
  createThread: (opts?: CreateThreadOptions) => Promise<WorkThread>;
  dispatchThread: (id: string, source?: 'now' | 'manual') => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
  renameThread: (title: string) => Promise<void>;
  updateMission: (mission: string) => Promise<void>;
  setStatus: (status: WorkThreadStatus) => Promise<void>;
  updateResumeCard: (patch: Partial<WorkThreadResumeCard>) => Promise<void>;
  toggleWorkingSetItem: (contextItemId: string) => Promise<void>;
  addWaitingCondition: (
    title: string,
    kind: WorkThreadWaitingCondition['kind'],
    detail?: string,
  ) => Promise<void>;
  toggleWaitingSatisfied: (id: string) => Promise<void>;
  captureInterrupt: (
    title: string,
    content?: string,
    source?: WorkThreadInterruptSource,
  ) => Promise<void>;
  resolveInterrupt: (id: string) => Promise<void>;
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
  await getDataStore().saveWorkThread(ensureWorkThreadRuntime(thread));
}

async function persistEvent(event: WorkThreadEvent): Promise<void> {
  await getDataStore().appendWorkThreadEvent(event);
}

async function readSchedulerPolicy(): Promise<WorkThreadSchedulerPolicy> {
  const raw = await getDataStore().getSetting(WORK_THREAD_SCHEDULER_POLICY_KEY);
  if (raw === 'manual' || raw === 'coach' || raw === 'semi_auto') return raw;
  return DEFAULT_WORK_THREAD_SCHEDULER_POLICY;
}

function updateThreadInList(threads: WorkThread[], next: WorkThread): WorkThread[] {
  return [next, ...threads.filter((thread) => thread.id !== next.id)];
}

function autoResumeCard(thread: WorkThread): WorkThreadResumeCard {
  const waitingSummary = thread.waitingFor
    .filter((item) => !item.satisfied)
    .map((item) => item.title)
    .slice(0, 3)
    .join(' / ');
  return buildAutoResumeCard(
    thread.docMarkdown,
    thread.nextActions,
    waitingSummary || undefined,
    Date.now(),
  );
}

function withContextItem(thread: WorkThread, item: WorkThreadContextItem): WorkThread {
  const contextItems = [item, ...thread.contextItems];
  const base = ensureWorkThreadRuntime({
    ...thread,
    contextItems,
    workingSet: deriveWorkingSet(contextItems),
    updatedAt: Date.now(),
  });
  return {
    ...base,
    resumeCard:
      base.resumeCard.summary || base.resumeCard.nextStep ? base.resumeCard : autoResumeCard(base),
  };
}

export const useWorkThreadStore = create<WorkThreadState>((set, get) => ({
  threads: [],
  currentThread: null,
  currentEvents: [],
  loading: false,
  aiBusy: false,
  saveError: null,
  schedulerPolicy: DEFAULT_WORK_THREAD_SCHEDULER_POLICY,

  loadThreads: async () => {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      set({ loading: true });
      try {
        const [threads, schedulerPolicy] = await Promise.all([
          getDataStore().listWorkThreads(200),
          readSchedulerPolicy(),
        ]);
        set({
          threads: threads.map((thread) => ensureWorkThreadRuntime(thread)),
          schedulerPolicy,
          loading: false,
          saveError: null,
        });
      } catch (error) {
        set({ loading: false, saveError: String(error) });
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  },

  loadSchedulerPolicy: async () => {
    const policy = await readSchedulerPolicy();
    set({ schedulerPolicy: policy });
    return policy;
  },

  setSchedulerPolicy: async (policy) => {
    await getDataStore().putSetting(WORK_THREAD_SCHEDULER_POLICY_KEY, policy);
    set({ schedulerPolicy: policy });
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
    set({
      currentThread: ensureWorkThreadRuntime(thread),
      currentEvents: events,
    });
    await get().loadThreads();
  },

  createThread: async (opts) => {
    const thread = ensureWorkThreadRuntime(
      createWorkThread({
        title: opts?.title?.trim() || defaultThreadTitle(),
        mission: opts?.mission,
        roleId: opts?.roleId,
        lane: opts?.lane,
        docMarkdown: opts?.docMarkdown,
        status: opts?.status,
      }),
    );
    await persistThread(thread);
    const event = createEvent(thread.id, 'created', 'user', 'Created thread');
    await persistEvent(event);
    set((state) => ({
      threads: updateThreadInList(state.threads, thread),
      currentThread: thread,
      currentEvents: [event],
      saveError: null,
    }));
    return thread;
  },

  dispatchThread: async (id, source = 'manual') => {
    const state = get();
    const existing =
      state.currentThread?.id === id
        ? state.currentThread
        : state.threads.find((thread) => thread.id === id) ?? (await getDataStore().getWorkThread(id));
    if (!existing) return;
    const current = ensureWorkThreadRuntime(existing);
    const next: WorkThread = {
      ...current,
      status: 'running',
      schedulerMeta: {
        ...current.schedulerMeta,
        lastActivatedAt: Date.now(),
        wakeReason: source === 'now' ? 'Dispatched from Now' : 'Opened manually',
      },
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const resumeEvent = createEvent(
      next.id,
      'thread_resumed',
      'system',
      source === 'now' ? 'Resumed from Now recommendation' : 'Resumed thread',
      undefined,
      { source },
    );
    await persistEvent(resumeEvent);
    const dispatchEvent =
      source === 'now'
        ? createEvent(
            next.id,
            'thread_dispatched',
            'system',
            'Dispatched from Now',
            undefined,
            { source },
          )
        : null;
    if (dispatchEvent) {
      await persistEvent(dispatchEvent);
    }
    const events = await getDataStore().listWorkThreadEvents(next.id, 300);
    set((store) => ({
      currentThread: next,
      currentEvents: [
        ...(dispatchEvent ? [dispatchEvent] : []),
        resumeEvent,
        ...events.filter(
          (item) => item.id !== resumeEvent.id && item.id !== dispatchEvent?.id,
        ),
      ],
      threads: updateThreadInList(store.threads, next),
    }));
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
      threads: updateThreadInList(state.threads, next),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  updateMission: async (mission) => {
    const current = get().currentThread;
    if (!current) return;
    const nextMission = mission.trim() || current.title;
    if (nextMission === current.mission) return;
    const next = { ...current, mission: nextMission, updatedAt: Date.now() };
    await persistThread(next);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
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
      threads: updateThreadInList(state.threads, next),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  updateResumeCard: async (patch) => {
    const current = get().currentThread;
    if (!current) return;
    const next: WorkThread = {
      ...current,
      resumeCard: {
        ...current.resumeCard,
        ...patch,
        guardrails:
          patch.guardrails ?? current.resumeCard.guardrails ?? [],
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const event = createEvent(next.id, 'resume_card_updated', 'user', 'Updated resume card');
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  toggleWorkingSetItem: async (contextItemId) => {
    const current = get().currentThread;
    if (!current) return;
    const existing = current.workingSet.find((item) => item.contextItemId === contextItemId);
    const workingSet: WorkThreadWorkingSetItem[] = existing
      ? current.workingSet.filter((item) => item.contextItemId !== contextItemId)
      : (() => {
          const contextItem = current.contextItems.find((item) => item.id === contextItemId);
          if (!contextItem) return current.workingSet;
          return [
            {
              id: contextItem.id,
              contextItemId: contextItem.id,
              title: contextItem.title,
              summary: contextItem.content,
              pinned: true,
              createdAt: Date.now(),
            },
            ...current.workingSet,
          ].slice(0, 7);
        })();
    const next = { ...current, workingSet, updatedAt: Date.now() };
    await persistThread(next);
    const event = createEvent(next.id, 'working_set_updated', 'user', 'Updated working set');
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  addWaitingCondition: async (title, kind, detail) => {
    const current = get().currentThread;
    if (!current || !title.trim()) return;
    const condition: WorkThreadWaitingCondition = {
      id: crypto.randomUUID(),
      kind,
      title: title.trim(),
      detail: detail?.trim() || undefined,
      satisfied: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = {
      ...current,
      waitingFor: [condition, ...current.waitingFor],
      status: current.status === 'running' ? 'waiting' : current.status,
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const event = createEvent(next.id, 'waiting_updated', 'user', `Added waiting condition: ${condition.title}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  toggleWaitingSatisfied: async (id) => {
    const current = get().currentThread;
    if (!current) return;
    const waitingFor = current.waitingFor.map((item) =>
      item.id === id ? { ...item, satisfied: !item.satisfied, updatedAt: Date.now() } : item,
    );
    const hasOpenWaiting = waitingFor.some((item) => !item.satisfied);
    const next = {
      ...current,
      waitingFor,
      status: current.status === 'waiting' && !hasOpenWaiting ? 'ready' : current.status,
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const event = createEvent(next.id, 'waiting_updated', 'user', 'Updated waiting condition');
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  captureInterrupt: async (title, content, source = 'manual') => {
    const current = get().currentThread;
    if (!current || !title.trim()) return;
    const interrupt = {
      id: crypto.randomUUID(),
      source,
      title: title.trim(),
      content: content?.trim() || undefined,
      capturedAt: Date.now(),
      resolved: false,
    };
    const next = {
      ...current,
      interrupts: [interrupt, ...current.interrupts],
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const event = createEvent(
      next.id,
      'interrupt_captured',
      source === 'system' ? 'system' : 'user',
      `Captured interrupt: ${interrupt.title}`,
      interrupt.content,
      { source },
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  resolveInterrupt: async (id) => {
    const current = get().currentThread;
    if (!current) return;
    const interrupts = current.interrupts.map((item) =>
      item.id === id ? { ...item, resolved: !item.resolved } : item,
    );
    const next = {
      ...current,
      interrupts,
      updatedAt: Date.now(),
    };
    await persistThread(next);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
    }));
  },

  updateDoc: (markdown) => {
    const current = get().currentThread;
    if (!current) return;
    const next = { ...current, docMarkdown: markdown, updatedAt: Date.now() };
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
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
      const nextResume =
        current.resumeCard.summary || current.resumeCard.nextStep ? current.resumeCard : autoResumeCard(current);
      const next = {
        ...current,
        resumeCard: nextResume,
        updatedAt: Date.now(),
      };
      await persistThread(next);
      set((state) => ({
        currentThread: next,
        threads: updateThreadInList(state.threads, next),
        saveError: null,
      }));
    } catch (error) {
      set({ saveError: String(error) });
    }
  },

  saveCheckpoint: async (title) => {
    const current = get().currentThread;
    if (!current) return;
    const next = {
      ...current,
      resumeCard: autoResumeCard(current),
      schedulerMeta: {
        ...current.schedulerMeta,
        lastCheckpointAt: Date.now(),
      },
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const event = createEvent(
      current.id,
      'checkpoint_saved',
      'system',
      title ?? 'Saved checkpoint',
      summarizeText(next.docMarkdown, 220) || undefined,
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
      currentEvents: [event, ...state.currentEvents],
    }));
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
    const next = withContextItem(current, item);
    await persistThread(next);
    const event = createEvent(current.id, 'context_added', 'user', `Added note context: ${item.title}`, item.content);
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
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
    const next = withContextItem(current, item);
    await persistThread(next);
    const event = createEvent(current.id, 'context_added', 'user', `Added link context: ${item.title}`, item.content);
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  addTaskToThread: async (task, mode = 'current') => {
    const current = get().currentThread;
    const roleId = task.roleId ?? task.roleIds?.[0];
    const thread =
      mode === 'new' || !current
        ? await get().createThread({
            title: displayTaskTitle(task),
            mission: `Push "${displayTaskTitle(task)}" forward.`,
            lane: 'execution',
            roleId,
            docMarkdown: `## Focus\n\n${formatTaskRefMarkdown(task)}\n`,
          })
        : current;
    const existing = thread.contextItems.find((item) => item.kind === 'task' && item.refId === task.id);
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
    const next = withContextItem(
      {
        ...thread,
        mission: thread.mission || `Push "${displayTaskTitle(task)}" forward.`,
        lane: thread.lane === 'general' ? 'execution' : thread.lane,
        docMarkdown:
          mode === 'new' && thread.docMarkdown.includes(formatTaskRefMarkdown(task))
            ? thread.docMarkdown
            : `${thread.docMarkdown.trim()}\n\n${formatTaskRefMarkdown(task)}`.trim(),
      },
      item,
    );
    await persistThread(next);
    const event = createEvent(thread.id, 'task_linked', 'user', `Linked task: ${item.title}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
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
            mission: `Organize and move "${title}" forward.`,
            lane: 'research',
            roleId: entry.roleId,
            docMarkdown: `## Notes from stream\n\n> ${summarizeText(entry.content, 220)}\n`,
          })
        : current;
    const existing = thread.contextItems.find((item) => item.kind === 'stream' && item.refId === entry.id);
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
    const next = withContextItem(thread, item);
    await persistThread(next);
    const event = createEvent(thread.id, 'context_added', 'user', `Added stream context: ${item.title}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
      currentEvents: [event, ...state.currentEvents.filter((timeline) => timeline.threadId === next.id)],
    }));
  },

  addDecision: async (title, detailMarkdown) => {
    const current = get().currentThread;
    if (!current || !title.trim()) return;
    const event = createEvent(current.id, 'decision_recorded', 'user', title.trim(), detailMarkdown?.trim() || undefined);
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
    const next = ensureWorkThreadRuntime({
      ...current,
      nextActions: [action, ...current.nextActions],
      resumeCard:
        current.resumeCard.nextStep
          ? current.resumeCard
          : {
              ...current.resumeCard,
              nextStep: action.text,
              updatedAt: Date.now(),
            },
      updatedAt: Date.now(),
    });
    await persistThread(next);
    const event = createEvent(current.id, 'next_action_added', source, `Added next action: ${action.text}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  toggleNextActionDone: async (id) => {
    const current = get().currentThread;
    if (!current) return;
    const next = ensureWorkThreadRuntime({
      ...current,
      nextActions: current.nextActions.map((action) =>
        action.id === id ? { ...action, done: !action.done } : action,
      ),
      updatedAt: Date.now(),
    });
    await persistThread(next);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
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
      threads: updateThreadInList(state.threads, next),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  runAiSuggestion: async (kind) => {
    const current = get().currentThread;
    if (!current) return;
    set({ aiBusy: true });
    try {
      const suggestion = await generateWorkThreadSuggestion(kind, current, useTaskStore.getState().tasks);
      const next = {
        ...current,
        suggestions: [suggestion, ...(current.suggestions ?? [])],
        updatedAt: Date.now(),
      };
      await persistThread(next);
      const event = createEvent(current.id, 'ai_suggested', 'ai', suggestion.title, suggestion.content, { kind });
      await persistEvent(event);
      set((state) => ({
        currentThread: next,
        threads: updateThreadInList(state.threads, next),
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
      suggestions: (current.suggestions ?? []).map((item) => (item.id === id ? { ...item, applied: true } : item)),
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const event = createEvent(current.id, 'ai_applied', 'user', `Inserted AI suggestion: ${suggestion.title}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
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
      suggestions: (current.suggestions ?? []).map((item) => (item.id === id ? { ...item, applied: true } : item)),
      updatedAt: Date.now(),
    };
    await persistThread(next);
    const event = createEvent(current.id, 'ai_applied', 'user', `Applied AI next steps: ${suggestion.title}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
      currentEvents: [event, ...state.currentEvents],
    }));
  },
}));

export function getRecentStreamCandidates(limit = 12): StreamEntry[] {
  return [...useStreamStore.getState().entries]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

export function getRecommendedThread(tasks: Task[]) {
  const state = useWorkThreadStore.getState();
  return pickWorkThreadForNow(state.threads, state.schedulerPolicy, tasks);
}
