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
import {
  LEGACY_LAST_OPENED_THREAD_ID_KEY,
  LEGACY_MATERIAL_SIDEBAR_DEFAULT_OPEN_KEY,
  LEGACY_THREAD_OPEN_MODE_KEY,
  LEGACY_THREAD_RUNTIME_SIDEBAR_DEFAULT_KEY,
  LAST_OPENED_THREAD_ID_KEY,
  MATERIAL_SIDEBAR_DEFAULT_OPEN_KEY,
  THREAD_OPEN_MODE_KEY,
  THREAD_RUNTIME_SIDEBAR_DEFAULT_KEY,
  type RuntimeSidebarDefault,
  type ThreadOpenMode,
} from '../utils/workThreadUiPrefs';
import { generateWorkThreadSuggestion, parseSuggestedNextSteps } from '../utils/workThreadAi';
import {
  applyMarkdownPatchToThread,
  checkWorkThreadExternalChanges,
  exportWorkThreadToMarkdownFile,
  type WorkThreadSyncPrefs,
  WORK_THREAD_MARKDOWN_AUTO_IMPORT_KEY,
  WORK_THREAD_MARKDOWN_SYNC_ENABLED_KEY,
  WORK_THREAD_MARKDOWN_SYNC_ROOT_KEY,
} from '../utils/workThreadSync';
import {
  appendRawCaptureToMarkdown,
  buildRawCaptureEvent,
  buildRawCaptureEvents,
  type WorkThreadRawCaptureSource,
} from '../utils/workThreadCaptures';
import { useStreamStore } from './streamStore';
import { useTaskStore } from './taskStore';

export const WORK_THREAD_SCHEDULER_POLICY_KEY = 'work-thread:thread-scheduler-policy';
export const LEGACY_WORK_THREAD_SCHEDULER_POLICY_KEY = 'think-session:thread-scheduler-policy';
export const WORK_THREAD_RUNTIME_SIDEBAR_REMEMBERED_KEY =
  'work-thread:thread-runtime-sidebar-remembered-open';
export const LEGACY_WORK_THREAD_RUNTIME_SIDEBAR_REMEMBERED_KEY =
  'think-session:thread-runtime-sidebar-remembered-open';

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
  lastOpenedThreadId: string | null;
  threadListOpen: boolean;
  materialSidebarOpen: boolean;
  runtimeSidebarOpen: boolean;
  runtimeSidebarRemembered: boolean;
  threadOpenMode: ThreadOpenMode;
  runtimeSidebarDefault: RuntimeSidebarDefault;
  markdownSyncEnabled: boolean;
  markdownSyncRoot: string;
  markdownAutoImport: boolean;
  docDirty: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'external-change' | 'disabled' | 'error';
  syncMessage: string | null;
  pendingExternalThread: WorkThread | null;
  persistedDocMarkdown: string;

  loadThreads: () => Promise<void>;
  loadUiPrefs: () => Promise<void>;
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
  captureToCurrentThread: (
    content: string,
    source?: WorkThreadRawCaptureSource,
  ) => Promise<boolean>;

  addDecision: (title: string, detailMarkdown?: string) => Promise<void>;
  addNextAction: (text: string, source?: 'user' | 'ai') => Promise<void>;
  toggleNextActionDone: (id: string) => Promise<void>;
  createTaskFromNextAction: (id: string) => Promise<void>;
  setMaterialSidebarOpen: (open: boolean) => Promise<void>;
  setRuntimeSidebarOpen: (open: boolean) => Promise<void>;
  setThreadListOpen: (open: boolean) => void;
  checkExternalSync: () => Promise<void>;
  reloadFromPendingExternal: () => Promise<void>;
  dismissPendingExternal: () => void;

  runAiSuggestion: (kind: WorkThreadSuggestionKind) => Promise<void>;
  applySuggestionToDoc: (id: string) => Promise<void>;
  applySuggestionToNextActions: (id: string) => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let loadPromise: Promise<void> | null = null;

function getCurrentSyncPrefs(): WorkThreadSyncPrefs {
  try {
    const state = useWorkThreadStore.getState();
    return {
      enabled: state.markdownSyncEnabled,
      root: state.markdownSyncRoot,
      autoImport: state.markdownAutoImport,
    };
  } catch {
    return {
      enabled: false,
      root: '',
      autoImport: false,
    };
  }
}

async function persistThread(thread: WorkThread): Promise<WorkThread> {
  const normalized = ensureWorkThreadRuntime(thread);
  const synced = await exportWorkThreadToMarkdownFile(normalized, getCurrentSyncPrefs());
  await getDataStore().saveWorkThread(synced);
  return synced;
}

async function persistEvent(event: WorkThreadEvent): Promise<void> {
  await getDataStore().appendWorkThreadEvent(event);
}

async function readSettingCompat(primary: string, legacy?: string): Promise<string | null> {
  const current = await getDataStore().getSetting(primary);
  if (current != null && current !== '') return current;
  if (!legacy) return current;
  return getDataStore().getSetting(legacy);
}

async function readSchedulerPolicy(): Promise<WorkThreadSchedulerPolicy> {
  const raw = await readSettingCompat(
    WORK_THREAD_SCHEDULER_POLICY_KEY,
    LEGACY_WORK_THREAD_SCHEDULER_POLICY_KEY,
  );
  if (raw === 'manual' || raw === 'coach' || raw === 'semi_auto') return raw;
  return DEFAULT_WORK_THREAD_SCHEDULER_POLICY;
}

async function readBooleanSetting(
  key: string,
  fallback: boolean,
  legacyKey?: string,
): Promise<boolean> {
  const raw = await readSettingCompat(key, legacyKey);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

async function readThreadOpenMode(): Promise<ThreadOpenMode> {
  const raw = await readSettingCompat(THREAD_OPEN_MODE_KEY, LEGACY_THREAD_OPEN_MODE_KEY);
  return raw === 'board-first' ? 'board-first' : 'resume-last';
}

async function readRuntimeSidebarDefault(): Promise<RuntimeSidebarDefault> {
  const raw = await readSettingCompat(
    THREAD_RUNTIME_SIDEBAR_DEFAULT_KEY,
    LEGACY_THREAD_RUNTIME_SIDEBAR_DEFAULT_KEY,
  );
  if (raw === 'open' || raw === 'closed') return raw;
  return 'remember';
}

async function rememberThreadOpenState(threadId: string | null): Promise<void> {
  await getDataStore().putSetting(LAST_OPENED_THREAD_ID_KEY, threadId ?? '');
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
  lastOpenedThreadId: null,
  threadListOpen: false,
  materialSidebarOpen: true,
  runtimeSidebarOpen: true,
  runtimeSidebarRemembered: true,
  threadOpenMode: 'resume-last',
  runtimeSidebarDefault: 'remember',
  markdownSyncEnabled: false,
  markdownSyncRoot: '',
  markdownAutoImport: true,
  docDirty: false,
  syncStatus: 'idle',
  syncMessage: null,
  pendingExternalThread: null,
  persistedDocMarkdown: '',

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

  loadUiPrefs: async () => {
    const [
      materialSidebarOpen,
      runtimeSidebarRemembered,
      threadOpenMode,
      runtimeSidebarDefault,
      lastOpenedThreadId,
      markdownSyncEnabled,
      markdownSyncRoot,
      markdownAutoImport,
    ] = await Promise.all([
      readBooleanSetting(
        MATERIAL_SIDEBAR_DEFAULT_OPEN_KEY,
        true,
        LEGACY_MATERIAL_SIDEBAR_DEFAULT_OPEN_KEY,
      ),
      readBooleanSetting(
        WORK_THREAD_RUNTIME_SIDEBAR_REMEMBERED_KEY,
        true,
        LEGACY_WORK_THREAD_RUNTIME_SIDEBAR_REMEMBERED_KEY,
      ),
      readThreadOpenMode(),
      readRuntimeSidebarDefault(),
      readSettingCompat(LAST_OPENED_THREAD_ID_KEY, LEGACY_LAST_OPENED_THREAD_ID_KEY),
      readBooleanSetting(WORK_THREAD_MARKDOWN_SYNC_ENABLED_KEY, false),
      readSettingCompat(WORK_THREAD_MARKDOWN_SYNC_ROOT_KEY),
      readBooleanSetting(WORK_THREAD_MARKDOWN_AUTO_IMPORT_KEY, true),
    ]);
    set({
      materialSidebarOpen,
      runtimeSidebarRemembered,
      runtimeSidebarOpen:
        runtimeSidebarDefault === 'open'
          ? true
          : runtimeSidebarDefault === 'closed'
            ? false
            : runtimeSidebarRemembered,
      threadOpenMode,
      runtimeSidebarDefault,
      lastOpenedThreadId: lastOpenedThreadId?.trim() || null,
      markdownSyncEnabled,
      markdownSyncRoot: markdownSyncRoot?.trim() || '',
      markdownAutoImport,
      syncStatus:
        markdownSyncEnabled && markdownSyncRoot?.trim() ? 'idle' : 'disabled',
    });
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
    set({ threadListOpen: true });
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
      lastOpenedThreadId: id,
      threadListOpen: false,
      pendingExternalThread: null,
      syncMessage: null,
      persistedDocMarkdown: thread.docMarkdown,
    });
    await rememberThreadOpenState(id);
    await get().loadThreads();
    await get().checkExternalSync();
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
    const savedThread = await persistThread(thread);
    const event = createEvent(thread.id, 'created', 'user', 'Created thread');
    await persistEvent(event);
    set((state) => ({
      threads: updateThreadInList(state.threads, savedThread),
      currentThread: savedThread,
      currentEvents: [event],
      saveError: null,
      lastOpenedThreadId: savedThread.id,
      threadListOpen: false,
      docDirty: false,
      syncStatus: 'synced',
      syncMessage: null,
      pendingExternalThread: null,
      persistedDocMarkdown: savedThread.docMarkdown,
    }));
    await rememberThreadOpenState(savedThread.id);
    return savedThread;
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
    const saved = await persistThread(next);
    const resumeEvent = createEvent(
      saved.id,
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
            saved.id,
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
    const events = await getDataStore().listWorkThreadEvents(saved.id, 300);
    set((store) => ({
      currentThread: saved,
      currentEvents: [
        ...(dispatchEvent ? [dispatchEvent] : []),
        resumeEvent,
        ...events.filter(
          (item) => item.id !== resumeEvent.id && item.id !== dispatchEvent?.id,
        ),
      ],
      threads: updateThreadInList(store.threads, saved),
      lastOpenedThreadId: saved.id,
      threadListOpen: false,
      docDirty: false,
      pendingExternalThread: null,
      syncMessage: null,
      persistedDocMarkdown: saved.docMarkdown,
    }));
    await rememberThreadOpenState(saved.id);
    await get().checkExternalSync();
  },

  deleteThread: async (id) => {
    await getDataStore().deleteWorkThread(id);
    set((state) => ({
      threads: state.threads.filter((thread) => thread.id !== id),
      currentThread: state.currentThread?.id === id ? null : state.currentThread,
      currentEvents: state.currentThread?.id === id ? [] : state.currentEvents,
      lastOpenedThreadId: state.lastOpenedThreadId === id ? null : state.lastOpenedThreadId,
    }));
    if (get().lastOpenedThreadId === null) {
      await rememberThreadOpenState(null);
    }
  },

  renameThread: async (title) => {
    const current = get().currentThread;
    const nextTitle = title.trim();
    if (!current || !nextTitle || nextTitle === current.title) return;
    const next = { ...current, title: nextTitle, updatedAt: Date.now() };
    const saved = await persistThread(next);
    const event = createEvent(saved.id, 'renamed', 'user', `Renamed thread to ${nextTitle}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  updateMission: async (mission) => {
    const current = get().currentThread;
    if (!current) return;
    const nextMission = mission.trim() || current.title;
    if (nextMission === current.mission) return;
    const next = { ...current, mission: nextMission, updatedAt: Date.now() };
    const saved = await persistThread(next);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
    }));
  },

  setStatus: async (status) => {
    const current = get().currentThread;
    if (!current || current.status === status) return;
    const next = { ...current, status, updatedAt: Date.now() };
    const saved = await persistThread(next);
    const event = createEvent(saved.id, 'status_changed', 'user', `Status changed to ${status}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
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
    const saved = await persistThread(next);
    const event = createEvent(saved.id, 'resume_card_updated', 'user', 'Updated resume card');
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
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
    const saved = await persistThread(next);
    const event = createEvent(saved.id, 'working_set_updated', 'user', 'Updated working set');
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
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
    const saved = await persistThread(next);
    const event = createEvent(saved.id, 'waiting_updated', 'user', `Added waiting condition: ${condition.title}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
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
    const saved = await persistThread(next);
    const event = createEvent(saved.id, 'waiting_updated', 'user', 'Updated waiting condition');
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
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
    const saved = await persistThread(next);
    const event = createEvent(
      saved.id,
      'interrupt_captured',
      source === 'system' ? 'system' : 'user',
      `Captured interrupt: ${interrupt.title}`,
      interrupt.content,
      { source },
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
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
    const saved = await persistThread(next);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
    }));
  },

  updateDoc: (markdown) => {
    const current = get().currentThread;
    if (!current) return;
    const next = applyMarkdownPatchToThread(
      {
        ...current,
        updatedAt: Date.now(),
      },
      markdown,
      current.syncMeta?.lastExternalModifiedAt,
    );
    set((state) => ({
      currentThread: next,
      threads: updateThreadInList(state.threads, next),
      docDirty: true,
      syncStatus: state.markdownSyncEnabled && state.markdownSyncRoot ? 'syncing' : 'disabled',
      syncMessage: null,
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
      const previousMarkdown = get().persistedDocMarkdown;
      const nextResume =
        current.resumeCard.summary || current.resumeCard.nextStep ? current.resumeCard : autoResumeCard(current);
      const next = {
        ...current,
        resumeCard: nextResume,
        updatedAt: Date.now(),
      };
      const saved = await persistThread(next);
      const rawCaptureEvents = buildRawCaptureEvents(
        saved.id,
        previousMarkdown,
        saved.docMarkdown,
      );
      await Promise.all(rawCaptureEvents.map((event) => persistEvent(event)));
      const newestEvents = [...rawCaptureEvents].sort((left, right) => right.createdAt - left.createdAt);
      set((state) => ({
        currentThread: saved,
        threads: updateThreadInList(state.threads, saved),
        currentEvents: [...newestEvents, ...state.currentEvents],
        saveError: null,
        docDirty: false,
        persistedDocMarkdown: saved.docMarkdown,
        syncStatus:
          state.markdownSyncEnabled && state.markdownSyncRoot ? 'synced' : 'disabled',
        syncMessage: null,
      }));
    } catch (error) {
      set({ saveError: String(error), syncStatus: 'error', syncMessage: String(error) });
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
    const saved = await persistThread(next);
    const event = createEvent(
      current.id,
      'checkpoint_saved',
      'system',
      title ?? 'Saved checkpoint',
      summarizeText(next.docMarkdown, 220) || undefined,
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: [event, ...state.currentEvents],
      docDirty: false,
      persistedDocMarkdown: saved.docMarkdown,
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
    const saved = await persistThread(next);
    const event = createEvent(current.id, 'context_added', 'user', `Added note context: ${item.title}`, item.content);
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
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
    const saved = await persistThread(next);
    const event = createEvent(current.id, 'context_added', 'user', `Added link context: ${item.title}`, item.content);
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
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
    const saved = await persistThread(next);
    const event = createEvent(thread.id, 'task_linked', 'user', `Linked task: ${item.title}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: [event, ...state.currentEvents.filter((entry) => entry.threadId === saved.id)],
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
    const saved = await persistThread(next);
    const event = createEvent(thread.id, 'context_added', 'user', `Added stream context: ${item.title}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: [event, ...state.currentEvents.filter((timeline) => timeline.threadId === saved.id)],
    }));
  },

  captureToCurrentThread: async (content, source = 'editor') => {
    const current = get().currentThread;
    const trimmed = content.replace(/\r\n/g, '\n').trim();
    if (!current || !trimmed) return false;
    const nextMarkdown = appendRawCaptureToMarkdown(current.docMarkdown, trimmed);
    const draft = applyMarkdownPatchToThread(
      {
        ...current,
        updatedAt: Date.now(),
      },
      nextMarkdown,
      current.syncMeta?.lastExternalModifiedAt,
    );
    const next = {
      ...draft,
      resumeCard:
        draft.resumeCard.summary || draft.resumeCard.nextStep ? draft.resumeCard : autoResumeCard(draft),
      updatedAt: Date.now(),
    };
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const saved = await persistThread(next);
    const event = buildRawCaptureEvent(saved.id, trimmed, {
      source,
      now: Date.now(),
    });
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: [event, ...state.currentEvents.filter((timeline) => timeline.threadId === saved.id)],
      saveError: null,
      docDirty: false,
      persistedDocMarkdown: saved.docMarkdown,
      syncStatus:
        state.markdownSyncEnabled && state.markdownSyncRoot ? 'synced' : 'disabled',
      syncMessage: null,
    }));
    return true;
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
    const saved = await persistThread(next);
    const event = createEvent(current.id, 'next_action_added', source, `Added next action: ${action.text}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
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
    const saved = await persistThread(next);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
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
    const saved = await persistThread(next);
    const event = createEvent(
      current.id,
      'task_created',
      'user',
      `Created task from thread: ${displayTaskTitle(createdTask)}`,
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: [event, ...state.currentEvents],
    }));
  },

  setMaterialSidebarOpen: async (open) => {
    set({ materialSidebarOpen: open });
  },

  setRuntimeSidebarOpen: async (open) => {
    set({ runtimeSidebarOpen: open, runtimeSidebarRemembered: open });
    await getDataStore().putSetting(
      WORK_THREAD_RUNTIME_SIDEBAR_REMEMBERED_KEY,
      open ? 'true' : 'false',
    );
  },

  setThreadListOpen: (open) => {
    set({ threadListOpen: open });
  },

  checkExternalSync: async () => {
    const current = get().currentThread;
    if (!current) return;
    const check = await checkWorkThreadExternalChanges(current, getCurrentSyncPrefs(), get().docDirty);
    if (check.kind === 'disabled' || check.kind === 'missing' || check.kind === 'unsupported') {
      set({
        syncStatus: check.kind === 'disabled' ? 'disabled' : 'idle',
        syncMessage: null,
        pendingExternalThread: null,
      });
      return;
    }
    if (check.kind === 'unchanged') {
      set({ syncStatus: 'synced', syncMessage: null, pendingExternalThread: null });
      return;
    }
    if (check.kind === 'external-change') {
      set({
        syncStatus: 'external-change',
        syncMessage: null,
        pendingExternalThread: check.thread,
      });
      return;
    }
    if (check.kind !== 'imported') {
      return;
    }
    const imported = await persistThread(check.thread);
    set((state) => ({
      currentThread: imported,
      threads: updateThreadInList(state.threads, imported),
      docDirty: false,
      persistedDocMarkdown: imported.docMarkdown,
      syncStatus: 'synced',
      syncMessage: null,
      pendingExternalThread: null,
    }));
  },

  reloadFromPendingExternal: async () => {
    const pending = get().pendingExternalThread;
    if (!pending) return;
    const saved = await persistThread(pending);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      docDirty: false,
      persistedDocMarkdown: saved.docMarkdown,
      syncStatus: 'synced',
      syncMessage: null,
      pendingExternalThread: null,
    }));
  },

  dismissPendingExternal: () => {
    set({ pendingExternalThread: null, syncStatus: 'idle', syncMessage: null });
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
      const saved = await persistThread(next);
      const event = createEvent(current.id, 'ai_suggested', 'ai', suggestion.title, suggestion.content, { kind });
      await persistEvent(event);
      set((state) => ({
        currentThread: saved,
        threads: updateThreadInList(state.threads, saved),
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
    const saved = await persistThread(next);
    const event = createEvent(current.id, 'ai_applied', 'user', `Inserted AI suggestion: ${suggestion.title}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
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
    const saved = await persistThread(next);
    const event = createEvent(current.id, 'ai_applied', 'user', `Applied AI next steps: ${suggestion.title}`);
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
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
