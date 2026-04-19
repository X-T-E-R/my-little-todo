import type {
  StreamEntry,
  Task,
  WorkThread,
  WorkThreadContextItem,
  WorkThreadEvent,
  WorkThreadIntent,
  WorkThreadNextAction,
  WorkThreadResumeCard,
  WorkThreadSchedulerPolicy,
  WorkThreadSparkContainer,
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
  parseWorkThreadMarkdown,
  pickWorkThreadForNow,
  serializeWorkThreadToMarkdown,
} from '@my-little-todo/core';
import { create } from 'zustand';
import { getDataStore } from '../storage/dataStore';
import { formatBlockRefMarkdown } from '../utils/blockRefs';
import { formatIntentRefMarkdown } from '../utils/intentRefs';
import { formatNextRefMarkdown } from '../utils/nextRefs';
import { formatSparkRefMarkdown } from '../utils/sparkRefs';
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
  buildRawCaptureEvent,
  buildRawCaptureEvents,
  type WorkThreadRawCaptureSource,
} from '../utils/workThreadCaptures';
import {
  normalizeWorkThreadFocus,
  type WorkThreadWorkspaceFocus,
} from '../utils/workThreadFocus';
import { insertIntoWorkThreadDoc } from '../utils/workThreadDocInsert';
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
  workspaceFocus: WorkThreadWorkspaceFocus;
  workspaceAutoFocusId: string | null;

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
  updateRootMarkdown: (markdown: string) => Promise<void>;
  updateExplorationMarkdown: (markdown: string) => Promise<void>;
  flushSave: () => Promise<void>;
  saveCheckpoint: (title?: string) => Promise<void>;

  addManualContext: (title: string, content?: string) => Promise<void>;
  addLinkContext: (title: string, url: string) => Promise<void>;
  addTaskToThread: (task: Task, mode?: ExternalTargetMode) => Promise<void>;
  addStreamToThread: (entry: StreamEntry, mode?: ExternalTargetMode) => Promise<void>;
  addIntent: (
    text: string,
    options?: {
      detail?: string;
      state?: WorkThreadIntent['state'];
      bodyMarkdown?: string;
      parentIntentId?: string;
      parentSparkId?: string;
      insertIntoDoc?: boolean;
      recordEvent?: boolean;
    },
  ) => Promise<WorkThreadIntent | null>;
  updateIntent: (
    id: string,
    patch: Partial<Pick<WorkThreadIntent, 'text' | 'detail' | 'bodyMarkdown' | 'collapsed' | 'state'>>,
  ) => Promise<void>;
  addSparkContainer: (
    title: string,
    options?: {
      bodyMarkdown?: string;
      parentIntentId?: string;
      parentSparkId?: string;
      recordEvent?: boolean;
    },
  ) => Promise<WorkThreadSparkContainer | null>;
  updateSparkContainer: (
    id: string,
    patch: Partial<Pick<WorkThreadSparkContainer, 'title' | 'bodyMarkdown' | 'collapsed'>>,
  ) => Promise<void>;
  addBlock: (
    title: string,
    options?: {
      detail?: string;
      parentIntentId?: string;
      parentSparkId?: string;
      insertIntoDoc?: boolean;
      recordEvent?: boolean;
    },
  ) => Promise<WorkThreadWaitingCondition | null>;
  updateBlock: (id: string, patch: Partial<Pick<WorkThreadWaitingCondition, 'title' | 'detail'>>) => Promise<void>;
  captureSelectionAsIntent: (
    content: string,
    nextDocMarkdown: string,
    intentOverride?: WorkThreadIntent,
  ) => Promise<WorkThreadIntent | null>;
  captureSelectionAsBlock: (
    content: string,
    nextDocMarkdown: string,
    blockOverride?: WorkThreadWaitingCondition,
  ) => Promise<WorkThreadWaitingCondition | null>;
  setIntentState: (id: string, state: WorkThreadIntent['state']) => Promise<void>;
  promoteIntentToNextAction: (id: string) => Promise<void>;
  captureIntentAsSpark: (id: string) => Promise<void>;
  createThreadFromIntent: (id: string) => Promise<void>;
  captureSelectionAsSpark: (
    content: string,
    nextDocMarkdown: string,
    entryOverride?: StreamEntry,
  ) => Promise<StreamEntry | null>;
  createThreadFromSpark: (entryId: string) => Promise<void>;
  createTaskFromSpark: (entryId: string) => Promise<void>;
  archiveSpark: (entryId: string) => Promise<void>;
  captureToCurrentThread: (
    content: string,
    source?: WorkThreadRawCaptureSource,
  ) => Promise<boolean>;

  addDecision: (title: string, detailMarkdown?: string) => Promise<void>;
  addNextAction: (
    text: string,
    source?: 'user' | 'ai',
    options?: {
      parentIntentId?: string;
      parentSparkId?: string;
      insertIntoDoc?: boolean;
      recordEvent?: boolean;
    },
  ) => Promise<WorkThreadNextAction | null>;
  updateNextAction: (
    id: string,
    patch: Partial<Pick<WorkThreadNextAction, 'text' | 'done'>>,
  ) => Promise<void>;
  captureSelectionAsNextAction: (
    content: string,
    nextDocMarkdown: string,
    actionOverride?: WorkThreadNextAction,
  ) => Promise<WorkThreadNextAction | null>;
  toggleNextActionDone: (id: string) => Promise<void>;
  createTaskFromNextAction: (id: string) => Promise<void>;
  setMaterialSidebarOpen: (open: boolean) => Promise<void>;
  setRuntimeSidebarOpen: (open: boolean) => Promise<void>;
  setThreadListOpen: (open: boolean) => void;
  setWorkspaceFocus: (focus: WorkThreadWorkspaceFocus) => void;
  requestWorkspaceAutoFocus: (id: string | null) => void;
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
  const blockSummary = thread.waitingFor
    .filter((item) => !item.satisfied)
    .map((item) => item.title)
    .slice(0, 3)
    .join(' / ');
  return buildAutoResumeCard(
    thread.docMarkdown,
    thread.nextActions,
    blockSummary || undefined,
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

async function updateSparkThreadMeta(
  entry: StreamEntry,
  patch: NonNullable<StreamEntry['threadMeta']>,
): Promise<StreamEntry> {
  const nextEntry: StreamEntry = {
    ...entry,
    threadMeta: {
      ...entry.threadMeta,
      ...patch,
    },
  };
  await useStreamStore.getState().updateEntry(nextEntry);
  return nextEntry;
}

function buildSparkExplorationBlock(entry: StreamEntry) {
  const now = Date.now();
  const summary = summarizeText(entry.content, 180);
  return {
    id: `spark-block-${entry.id}`,
    title: summarizeText(entry.content, 48) || 'Spark',
    summary,
    anchor: {
      kind: 'spark_ref' as const,
      refId: entry.id,
    },
    collapsed: false,
    createdAt: now,
    updatedAt: now,
  };
}

function buildIntent(text: string, detail?: string, state: WorkThreadIntent['state'] = 'active'): WorkThreadIntent {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    detail: detail?.trim() || undefined,
    bodyMarkdown: detail?.trim() || '',
    collapsed: false,
    state,
    createdAt: now,
    updatedAt: now,
  };
}

function buildIntentAnchor(intent: WorkThreadIntent) {
  const now = Date.now();
  return {
    id: `intent-anchor-${intent.id}`,
    kind: 'intent' as const,
    marker: formatIntentRefMarkdown(intent),
    refId: intent.id,
    createdAt: now,
    updatedAt: now,
  };
}

function buildNextAction(
  text: string,
  source: 'user' | 'ai' = 'user',
): WorkThreadNextAction {
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    done: false,
    source,
    createdAt: Date.now(),
  };
}

function buildNextActionAnchor(action: WorkThreadNextAction) {
  const now = Date.now();
  return {
    id: `next-anchor-${action.id}`,
    kind: 'next' as const,
    marker: formatNextRefMarkdown(action),
    refId: action.id,
    createdAt: now,
    updatedAt: now,
  };
}

function buildBlock(
  title: string,
  detail?: string,
  kind: WorkThreadWaitingCondition['kind'] = 'external',
): WorkThreadWaitingCondition {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    kind,
    title: title.trim(),
    detail: detail?.trim() || undefined,
    satisfied: false,
    createdAt: now,
    updatedAt: now,
  };
}

function applyDocInsertion(
  thread: WorkThread,
  focus: WorkThreadWorkspaceFocus,
  kind: 'body' | 'intent' | 'spark' | 'next' | 'block',
  text: string,
): WorkThread {
  const nextDocMarkdown = insertIntoWorkThreadDoc(thread, focus, kind, text);
  return applyMarkdownPatchToThread(thread, nextDocMarkdown);
}

function pickNewestIntent(
  thread: WorkThread,
  text: string,
  parent?: { parentIntentId?: string; parentSparkId?: string },
): WorkThreadIntent | null {
  const normalized = text.trim().toLowerCase();
  return (
    [...thread.intents]
      .filter(
        (item) =>
          item.text.trim().toLowerCase() === normalized &&
          item.parentIntentId === parent?.parentIntentId &&
          item.parentSparkId === parent?.parentSparkId,
      )
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0] ?? null
  );
}

function pickNewestSpark(
  thread: WorkThread,
  title: string,
  parent?: { parentIntentId?: string; parentSparkId?: string },
): WorkThreadSparkContainer | null {
  const normalized = title.trim().toLowerCase();
  return (
    [...thread.sparkContainers]
      .filter(
        (item) =>
          item.title.trim().toLowerCase() === normalized &&
          item.parentIntentId === parent?.parentIntentId &&
          item.parentSparkId === parent?.parentSparkId,
      )
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0] ?? null
  );
}

function pickNewestBlock(
  thread: WorkThread,
  title: string,
  parent?: { parentIntentId?: string; parentSparkId?: string },
): WorkThreadWaitingCondition | null {
  const normalized = title.trim().toLowerCase();
  return (
    [...thread.waitingFor]
      .filter(
        (item) =>
          !item.satisfied &&
          item.title.trim().toLowerCase() === normalized &&
          item.parentIntentId === parent?.parentIntentId &&
          item.parentSparkId === parent?.parentSparkId,
      )
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0] ?? null
  );
}

function pickNewestNextAction(
  thread: WorkThread,
  text: string,
  parent?: { parentIntentId?: string; parentSparkId?: string },
): WorkThreadNextAction | null {
  const normalized = text.trim().toLowerCase();
  return (
    [...thread.nextActions]
      .filter(
        (item) =>
          item.text.trim().toLowerCase() === normalized &&
          item.parentIntentId === parent?.parentIntentId &&
          item.parentSparkId === parent?.parentSparkId,
      )
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0] ?? null
  );
}

function resolveDocInsertionFocus(
  thread: WorkThread,
  fallbackFocus: WorkThreadWorkspaceFocus,
  parent?: { parentIntentId?: string; parentSparkId?: string },
): WorkThreadWorkspaceFocus {
  if (parent?.parentSparkId && thread.sparkContainers.some((item) => item.id === parent.parentSparkId)) {
    return { kind: 'spark', id: parent.parentSparkId };
  }
  if (parent?.parentIntentId && thread.intents.some((item) => item.id === parent.parentIntentId)) {
    return { kind: 'intent', id: parent.parentIntentId };
  }
  return normalizeWorkThreadFocus(thread, fallbackFocus);
}

function materializeStructuredThread(thread: WorkThread): WorkThread {
  const normalized = ensureWorkThreadRuntime(thread);
  const markdown = serializeWorkThreadToMarkdown(normalized);
  const patch = parseWorkThreadMarkdown(markdown);
  return ensureWorkThreadRuntime({
    ...normalized,
    docMarkdown: patch.docMarkdown,
  });
}

function buildBlockAnchor(block: WorkThreadWaitingCondition) {
  const now = Date.now();
  return {
    id: `block-anchor-${block.id}`,
    kind: 'block' as const,
    marker: formatBlockRefMarkdown(block),
    refId: block.id,
    createdAt: now,
    updatedAt: now,
  };
}

async function createSparkFromIntent(
  thread: WorkThread,
  intent: WorkThreadIntent,
): Promise<StreamEntry> {
  return useStreamStore.getState().addEntry(
    intent.bodyMarkdown?.trim() ? `${intent.text}\n\n${intent.bodyMarkdown.trim()}` : intent.text,
    false,
    {
    roleId: thread.roleId,
    entryType: 'spark',
    threadMeta: {
      sourceThreadId: thread.id,
      sparkState: 'open',
      originIntentId: intent.id,
      parentIntentId: intent.id,
      parentSparkId: intent.parentSparkId,
    },
  });
}

async function syncSparkEntryContent(
  thread: WorkThread,
  spark: WorkThreadSparkContainer,
): Promise<StreamEntry | null> {
  const content = spark.bodyMarkdown.trim() ? `${spark.title}\n\n${spark.bodyMarkdown.trim()}` : spark.title;
  if (!spark.streamEntryId) {
    const entry = await useStreamStore.getState().addEntry(content, false, {
      roleId: thread.roleId,
      entryType: 'spark',
      threadMeta: {
        sourceThreadId: thread.id,
        sparkState: 'open',
        parentIntentId: spark.parentIntentId,
        parentSparkId: spark.parentSparkId,
      },
    });
    return entry;
  }
  const currentEntry = useStreamStore.getState().entries.find((item) => item.id === spark.streamEntryId);
  if (!currentEntry) return null;
  const nextEntry: StreamEntry = {
    ...currentEntry,
    content,
    threadMeta: {
      ...currentEntry.threadMeta,
      sourceThreadId: thread.id,
      parentIntentId: spark.parentIntentId,
      parentSparkId: spark.parentSparkId,
    },
  };
  await useStreamStore.getState().updateEntry(nextEntry);
  return nextEntry;
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
  workspaceFocus: { kind: 'root' },
  workspaceAutoFocusId: null,

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
      workspaceFocus: { kind: 'root' },
      workspaceAutoFocusId: null,
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
      workspaceFocus: { kind: 'root' },
      workspaceAutoFocusId: null,
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
      workspaceFocus: { kind: 'root' },
      workspaceAutoFocusId: null,
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
    const nextBlockSummary =
      patch.blockSummary ??
      patch.waitingSummary ??
      current.resumeCard.blockSummary ??
      current.resumeCard.waitingSummary;
    const next: WorkThread = {
      ...current,
      resumeCard: {
        ...current.resumeCard,
        ...patch,
        blockSummary: nextBlockSummary,
        waitingSummary: nextBlockSummary,
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
      parentThreadId: current.id,
      satisfied: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = materializeStructuredThread({
      ...current,
      waitingFor: [condition, ...current.waitingFor],
      status: current.status === 'running' ? 'waiting' : current.status,
      updatedAt: Date.now(),
    });
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
    const next = materializeStructuredThread({
      ...current,
      waitingFor,
      status: current.status === 'waiting' && !hasOpenWaiting ? 'ready' : current.status,
      updatedAt: Date.now(),
    });
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
      parentThreadId: current.id,
      capturedAt: Date.now(),
      resolved: false,
    };
    const next = materializeStructuredThread({
      ...current,
      interrupts: [interrupt, ...current.interrupts],
      updatedAt: Date.now(),
    });
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
    const next = materializeStructuredThread({
      ...current,
      interrupts,
      updatedAt: Date.now(),
    });
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

  updateRootMarkdown: async (markdown) => {
    const current = get().currentThread;
    if (!current) return;
    const next = materializeStructuredThread({
      ...current,
      rootMarkdown: markdown,
      updatedAt: Date.now(),
    });
    const saved = await persistThread(next);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      persistedDocMarkdown: saved.docMarkdown,
      docDirty: false,
      syncStatus:
        state.markdownSyncEnabled && state.markdownSyncRoot ? 'synced' : 'disabled',
      syncMessage: null,
    }));
  },

  updateExplorationMarkdown: async (markdown) => {
    const current = get().currentThread;
    if (!current) return;
    const next = materializeStructuredThread({
      ...current,
      explorationMarkdown: markdown,
      updatedAt: Date.now(),
    });
    const saved = await persistThread(next);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      persistedDocMarkdown: saved.docMarkdown,
      docDirty: false,
      syncStatus:
        state.markdownSyncEnabled && state.markdownSyncRoot ? 'synced' : 'disabled',
      syncMessage: null,
    }));
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

  addIntent: async (text, options) => {
    const current = get().currentThread;
    const trimmed = text.trim();
    if (!current || !trimmed) return null;
    const parent =
      options?.parentIntentId || options?.parentSparkId
        ? {
            parentIntentId: options.parentIntentId,
            parentSparkId: options.parentSparkId,
          }
        : undefined;
    if (options?.insertIntoDoc) {
      const next = {
        ...applyDocInsertion(current, { kind: 'root' }, 'intent', trimmed),
        updatedAt: Date.now(),
      };
      const saved = await persistThread(next);
      const created = pickNewestIntent(saved, trimmed, parent);
      const event =
        options?.recordEvent === false || !created
          ? null
          : createEvent(
              current.id,
              'intent_added',
              'user',
              `Added intent: ${created.text}`,
              created.detail,
              { intentId: created.id },
            );
      if (event) {
        await persistEvent(event);
      }
      set((state) => ({
        currentThread: saved,
        threads: updateThreadInList(state.threads, saved),
        currentEvents: event
          ? [event, ...state.currentEvents.filter((entry) => entry.threadId === saved.id)]
          : state.currentEvents,
        persistedDocMarkdown: saved.docMarkdown,
        docDirty: false,
      }));
      return created;
    }
    const intent = {
      ...buildIntent(trimmed, options?.bodyMarkdown ?? options?.detail, options?.state),
      detail: options?.detail?.trim() || undefined,
      bodyMarkdown: options?.bodyMarkdown?.trim() ?? options?.detail?.trim() ?? '',
      parentThreadId: current.id,
      parentIntentId: options?.parentIntentId,
      parentSparkId: options?.parentSparkId,
    };
    const next = materializeStructuredThread({
      ...current,
      intents: [intent, ...current.intents],
      updatedAt: Date.now(),
    });
    const saved = await persistThread(next);
    const event =
      options?.recordEvent === false
        ? null
        : createEvent(
            current.id,
            'intent_added',
            'user',
            `Added intent: ${intent.text}`,
            intent.detail,
            { intentId: intent.id },
          );
    if (event) {
      await persistEvent(event);
    }
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: event
        ? [event, ...state.currentEvents.filter((entry) => entry.threadId === saved.id)]
        : state.currentEvents,
    }));
    return intent;
  },

  updateIntent: async (id, patch) => {
    const current = get().currentThread;
    if (!current) return;
    const next = materializeStructuredThread({
      ...current,
      intents: current.intents.map((item) =>
        item.id === id
          ? {
              ...item,
              text: patch.text?.trim() ?? item.text,
              detail: patch.detail?.trim() ?? item.detail,
              bodyMarkdown: patch.bodyMarkdown ?? item.bodyMarkdown,
              collapsed: patch.collapsed ?? item.collapsed,
              state: patch.state ?? item.state,
              updatedAt: Date.now(),
            }
          : item,
      ),
      updatedAt: Date.now(),
    });
    const saved = await persistThread(next);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      persistedDocMarkdown: saved.docMarkdown,
    }));
  },

  addSparkContainer: async (title, options) => {
    const current = get().currentThread;
    const trimmed = title.trim();
    if (!current || !trimmed) return null;
    const parent =
      options?.parentIntentId || options?.parentSparkId
        ? {
            parentIntentId: options.parentIntentId,
            parentSparkId: options.parentSparkId,
          }
        : undefined;
    const insertionFocus = resolveDocInsertionFocus(current, get().workspaceFocus, parent);
    const nextFromDoc = {
      ...applyDocInsertion(
        current,
        insertionFocus,
        'spark',
        options?.bodyMarkdown?.trim() ? `${trimmed}\n${options.bodyMarkdown.trim()}` : trimmed,
      ),
      updatedAt: Date.now(),
    };
    const createdSpark = pickNewestSpark(nextFromDoc, trimmed, parent);
    if (!createdSpark) return null;
    const entry = await syncSparkEntryContent(nextFromDoc, createdSpark);
    const next = {
      ...nextFromDoc,
      sparkContainers: nextFromDoc.sparkContainers.map((item) =>
        item.id === createdSpark.id
          ? {
              ...item,
              streamEntryId: entry?.id ?? item.streamEntryId,
              linkedTaskId: entry?.threadMeta?.linkedTaskId ?? item.linkedTaskId,
              promotedThreadId: entry?.threadMeta?.promotedThreadId ?? item.promotedThreadId,
            }
          : item,
      ),
      updatedAt: Date.now(),
    };
    const saved = await persistThread(next);
    const created =
      saved.sparkContainers.find((item) => item.id === createdSpark.id) ??
      pickNewestSpark(saved, trimmed, parent);
    const event =
      options?.recordEvent === false || !created
        ? null
        : createEvent(
            current.id,
            'spark_captured',
            'user',
            `Captured spark: ${created.title}`,
            created.bodyMarkdown || undefined,
            { sparkId: created.id, streamEntryId: entry?.id },
          );
    if (event) {
      await persistEvent(event);
    }
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: event
        ? [event, ...state.currentEvents.filter((item) => item.threadId === saved.id)]
        : state.currentEvents,
      persistedDocMarkdown: saved.docMarkdown,
      docDirty: false,
    }));
    return created ?? null;
  },

  updateSparkContainer: async (id, patch) => {
    const current = get().currentThread;
    if (!current) return;
    const target = current.sparkContainers.find((item) => item.id === id);
    if (!target) return;
    const draft = {
      ...target,
      title: patch.title?.trim() ?? target.title,
      bodyMarkdown: patch.bodyMarkdown ?? target.bodyMarkdown,
      collapsed: patch.collapsed ?? target.collapsed,
      updatedAt: Date.now(),
    };
    const entry = await syncSparkEntryContent(current, draft);
    const next = materializeStructuredThread({
      ...current,
      sparkContainers: current.sparkContainers.map((item) =>
        item.id === id
          ? {
              ...draft,
              streamEntryId: entry?.id ?? item.streamEntryId,
              linkedTaskId: entry?.threadMeta?.linkedTaskId ?? item.linkedTaskId,
              promotedThreadId: entry?.threadMeta?.promotedThreadId ?? item.promotedThreadId,
            }
          : item,
      ),
      updatedAt: Date.now(),
    });
    const saved = await persistThread(next);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      persistedDocMarkdown: saved.docMarkdown,
      docDirty: false,
    }));
  },

  addBlock: async (title, options) => {
    const current = get().currentThread;
    const trimmed = title.trim();
    if (!current || !trimmed) return null;
    const parent =
      options?.parentIntentId || options?.parentSparkId
        ? {
            parentIntentId: options.parentIntentId,
            parentSparkId: options.parentSparkId,
          }
        : undefined;
    if (options?.insertIntoDoc) {
      const insertionFocus = resolveDocInsertionFocus(current, get().workspaceFocus, parent);
      const rawBlockText = options?.detail?.trim() ? `${trimmed}\n${options.detail.trim()}` : trimmed;
      const next = {
        ...applyDocInsertion(
          current,
          insertionFocus,
          'block',
          rawBlockText,
        ),
        status: current.status === 'running' ? 'waiting' : current.status,
        updatedAt: Date.now(),
      };
      const saved = await persistThread(next);
      const created = pickNewestBlock(saved, trimmed, parent);
      const event =
        options?.recordEvent === false || !created
          ? null
          : createEvent(
              current.id,
              'waiting_updated',
              'user',
              `Added block: ${created.title}`,
              created.detail,
              { blockId: created.id, sourceKind: 'waiting' },
            );
      if (event) {
        await persistEvent(event);
      }
      set((state) => ({
        currentThread: saved,
        threads: updateThreadInList(state.threads, saved),
        currentEvents: event
          ? [event, ...state.currentEvents.filter((entry) => entry.threadId === saved.id)]
          : state.currentEvents,
        persistedDocMarkdown: saved.docMarkdown,
        docDirty: false,
      }));
      return created;
    }
    const block = {
      ...buildBlock(trimmed, options?.detail),
      parentThreadId: current.id,
      parentIntentId: options?.parentIntentId,
      parentSparkId: options?.parentSparkId,
    };
    const next = materializeStructuredThread({
      ...current,
      waitingFor: [block, ...current.waitingFor],
      status: current.status === 'running' ? 'waiting' : current.status,
      updatedAt: Date.now(),
    });
    const saved = await persistThread(next);
    const event =
      options?.recordEvent === false
        ? null
        : createEvent(
            current.id,
            'waiting_updated',
            'user',
            `Added block: ${block.title}`,
            block.detail,
            { blockId: block.id, sourceKind: 'waiting' },
          );
    if (event) {
      await persistEvent(event);
    }
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: event
        ? [event, ...state.currentEvents.filter((entry) => entry.threadId === saved.id)]
        : state.currentEvents,
    }));
    return block;
  },

  updateBlock: async (id, patch) => {
    const current = get().currentThread;
    if (!current) return;
    const next = materializeStructuredThread({
      ...current,
      waitingFor: current.waitingFor.map((item) =>
        item.id === id
          ? {
              ...item,
              title: patch.title?.trim() ?? item.title,
              detail: patch.detail?.trim() ?? item.detail,
              updatedAt: Date.now(),
            }
          : item,
      ),
      updatedAt: Date.now(),
    });
    const saved = await persistThread(next);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      persistedDocMarkdown: saved.docMarkdown,
    }));
  },

  captureSelectionAsIntent: async (content, nextDocMarkdown, intentOverride) => {
    const current = get().currentThread;
    const trimmed = content.replace(/\r\n/g, '\n').trim();
    if (!current || !trimmed) return null;
    const intent = intentOverride ?? buildIntent(trimmed);
    const existingIntents = current.intents.some((item) => item.id === intent.id)
      ? current.intents.map((item) =>
          item.id === intent.id ? { ...item, text: intent.text, detail: intent.detail } : item,
        )
      : [intent, ...current.intents];
    const existingAnchors = current.inlineAnchors.some((item) => item.refId === intent.id)
      ? current.inlineAnchors.map((item) =>
          item.refId === intent.id
            ? { ...item, marker: formatIntentRefMarkdown(intent), updatedAt: Date.now() }
            : item,
        )
      : [buildIntentAnchor(intent), ...current.inlineAnchors];
    const next = ensureWorkThreadRuntime({
      ...current,
      docMarkdown: nextDocMarkdown,
      intents: existingIntents,
      inlineAnchors: existingAnchors,
      updatedAt: Date.now(),
    });
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const saved = await persistThread(next);
    const event = createEvent(
      current.id,
      'intent_added',
      'user',
      `Captured intent: ${summarizeText(intent.text, 48) || 'Intent'}`,
      trimmed,
      { intentId: intent.id },
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: [event, ...state.currentEvents.filter((entry) => entry.threadId === saved.id)],
      docDirty: false,
      persistedDocMarkdown: saved.docMarkdown,
    }));
    return intent;
  },

  captureSelectionAsBlock: async (content, nextDocMarkdown, blockOverride) => {
    const current = get().currentThread;
    const trimmed = content.replace(/\r\n/g, '\n').trim();
    if (!current || !trimmed) return null;
    const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
    const title = lines[0] ?? trimmed;
    const detail = lines.slice(1).join('\n').trim() || blockOverride?.detail;
    const block = blockOverride ?? buildBlock(title, detail);
    const existingBlocks = current.waitingFor.some((item) => item.id === block.id)
      ? current.waitingFor.map((item) =>
          item.id === block.id
            ? { ...item, title, detail: detail || undefined, updatedAt: Date.now() }
            : item,
        )
      : [{ ...block, title, detail: detail || undefined }, ...current.waitingFor];
    const existingAnchors = current.inlineAnchors.some((item) => item.refId === block.id)
      ? current.inlineAnchors.map((item) =>
          item.refId === block.id
            ? {
                ...item,
                marker: formatBlockRefMarkdown({ id: block.id, title }),
                updatedAt: Date.now(),
              }
            : item,
        )
      : [buildBlockAnchor({ ...block, title, detail: detail || undefined }), ...current.inlineAnchors];
    const next = ensureWorkThreadRuntime({
      ...current,
      docMarkdown: nextDocMarkdown,
      waitingFor: existingBlocks,
      status: current.status === 'running' ? 'waiting' : current.status,
      inlineAnchors: existingAnchors,
      updatedAt: Date.now(),
    });
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const saved = await persistThread(next);
    const event = createEvent(
      current.id,
      'waiting_updated',
      'user',
      `Captured block: ${summarizeText(title, 48) || 'Block'}`,
      detail,
      { blockId: block.id, sourceKind: 'waiting' },
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: [event, ...state.currentEvents.filter((entry) => entry.threadId === saved.id)],
      docDirty: false,
      persistedDocMarkdown: saved.docMarkdown,
    }));
    return block;
  },

  setIntentState: async (id, stateValue) => {
    const current = get().currentThread;
    if (!current) return;
    const target = current.intents.find((item) => item.id === id);
    if (!target || target.state === stateValue) return;
    const next = materializeStructuredThread({
      ...current,
      intents: current.intents.map((item) =>
        item.id === id ? { ...item, state: stateValue, updatedAt: Date.now() } : item,
      ),
      updatedAt: Date.now(),
    });
    const saved = await persistThread(next);
    const event = createEvent(
      current.id,
      stateValue === 'archived' ? 'intent_archived' : 'intent_updated',
      'user',
      `${stateValue === 'archived' ? 'Archived' : 'Updated'} intent: ${target.text}`,
      undefined,
      { intentId: id, state: stateValue },
    );
    await persistEvent(event);
    set((store) => ({
      currentThread: saved,
      threads: updateThreadInList(store.threads, saved),
      currentEvents: [event, ...store.currentEvents.filter((entry) => entry.threadId === saved.id)],
    }));
  },

  promoteIntentToNextAction: async (id) => {
    const current = get().currentThread;
    if (!current) return;
    const target = current.intents.find((item) => item.id === id);
    if (!target) return;
    const action: WorkThreadNextAction = {
      id: crypto.randomUUID(),
      text: target.text,
      done: false,
      source: 'user',
      parentThreadId: current.id,
      parentIntentId: target.id,
      linkedTaskId: target.linkedTaskId,
      createdAt: Date.now(),
    };
    const next = materializeStructuredThread({
      ...current,
      intents: current.intents.map((item) =>
        item.id === id ? { ...item, state: 'done', updatedAt: Date.now() } : item,
      ),
      nextActions: [action, ...current.nextActions],
      updatedAt: Date.now(),
    });
    const saved = await persistThread(next);
    const event = createEvent(
      current.id,
      'intent_promoted',
      'user',
      `Promoted intent to next step: ${target.text}`,
      undefined,
      { intentId: id, nextActionId: action.id },
    );
    await persistEvent(event);
    set((store) => ({
      currentThread: saved,
      threads: updateThreadInList(store.threads, saved),
      currentEvents: [event, ...store.currentEvents.filter((entry) => entry.threadId === saved.id)],
    }));
  },

  captureIntentAsSpark: async (id) => {
    const initial = get().currentThread;
    if (!initial) return;
    const target = initial.intents.find((item) => item.id === id);
    if (!target) return;
    const existingContainer = initial.sparkContainers.find((item) => item.parentIntentId === id);
    const createdContainer =
      existingContainer ??
      (await get().addSparkContainer(target.text, {
        bodyMarkdown: target.bodyMarkdown ?? target.detail,
        parentIntentId: id,
        recordEvent: false,
      }));
    const current = get().currentThread;
    if (!current) return;
    const sparkEntry = createdContainer?.streamEntryId
      ? useStreamStore.getState().entries.find((item) => item.id === createdContainer.streamEntryId)
      : await createSparkFromIntent(current, target);
    const next = materializeStructuredThread({
      ...current,
      intents: current.intents.map((item) =>
        item.id === id
          ? {
              ...item,
              linkedSparkId: sparkEntry?.id ?? item.linkedSparkId,
              updatedAt: Date.now(),
            }
          : item,
      ),
      sparkContainers: current.sparkContainers.map((item) =>
        createdContainer && item.id === createdContainer.id
          ? {
              ...item,
              streamEntryId: sparkEntry?.id ?? item.streamEntryId,
              linkedTaskId: sparkEntry?.threadMeta?.linkedTaskId ?? item.linkedTaskId,
              promotedThreadId: sparkEntry?.threadMeta?.promotedThreadId ?? item.promotedThreadId,
            }
          : item,
      ),
      updatedAt: Date.now(),
    });
    const saved = await persistThread(next);
    const event = createEvent(
      current.id,
      'intent_promoted',
      'user',
      `Captured spark from intent: ${target.text}`,
      target.bodyMarkdown ?? target.detail,
      { intentId: id, streamEntryId: sparkEntry?.id },
    );
    await persistEvent(event);
    set((store) => ({
      currentThread: saved,
      threads: updateThreadInList(store.threads, saved),
      currentEvents: [event, ...store.currentEvents.filter((entryItem) => entryItem.threadId === saved.id)],
    }));
  },

  createThreadFromIntent: async (id) => {
    const current = get().currentThread;
    if (!current) return;
    const target = current.intents.find((item) => item.id === id);
    if (!target) return;
    await get().captureIntentAsSpark(id);
    const refreshedEntry =
      useStreamStore
        .getState()
        .entries.find((item) => item.threadMeta?.originIntentId === id && item.threadMeta?.sourceThreadId === current.id) ??
      useStreamStore.getState().entries.find((item) => item.id === target.linkedSparkId);
    if (!refreshedEntry) return;
    await get().createThreadFromSpark(refreshedEntry.id);
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
    const entryRefMarkdown =
      entry.entryType === 'spark'
        ? formatSparkRefMarkdown(entry)
        : `> ${summarizeText(entry.content, 220)}`;
    const thread =
      mode === 'new' || !current
        ? await get().createThread({
            title,
            mission: `Organize and move "${title}" forward.`,
            lane: 'research',
            roleId: entry.roleId,
            docMarkdown: `## Notes from stream\n\n${entryRefMarkdown}\n`,
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

  captureSelectionAsSpark: async (content, nextDocMarkdown, entryOverride) => {
    const current = get().currentThread;
    const trimmed = content.replace(/\r\n/g, '\n').trim();
    if (!current || !trimmed) return null;
    const entry =
      entryOverride ??
      (await useStreamStore.getState().addEntry(trimmed, false, {
        roleId: current.roleId,
        entryType: 'spark',
        threadMeta: {
          sourceThreadId: current.id,
          sparkState: 'open',
        },
      }));
    const next = ensureWorkThreadRuntime({
      ...current,
      docMarkdown: nextDocMarkdown,
      explorationBlocks: [
        buildSparkExplorationBlock(entry),
        ...current.explorationBlocks.filter((block) => block.anchor.refId !== entry.id),
      ],
      updatedAt: Date.now(),
    });
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const saved = await persistThread(next);
    const event = createEvent(
      current.id,
      'spark_captured',
      'user',
      `Captured spark: ${summarizeText(trimmed, 48) || 'Spark'}`,
      trimmed,
      { streamEntryId: entry.id },
    );
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
    return entry;
  },

  createThreadFromSpark: async (entryId) => {
    const entry = useStreamStore.getState().entries.find((item) => item.id === entryId);
    const sourceThread = get().currentThread;
    if (!entry) return;
    const thread = await get().createThread({
      title: summarizeText(entry.content, 64) || 'Spark thread',
      mission: `Explore "${summarizeText(entry.content, 64) || 'spark'}".`,
      lane: 'research',
      roleId: entry.roleId,
      docMarkdown: `## Spark\n\n${formatSparkRefMarkdown(entry)}\n`,
    });
    await get().addStreamToThread(entry, 'current');
    await updateSparkThreadMeta(entry, {
      sourceThreadId: entry.threadMeta?.sourceThreadId,
      sparkState: 'promoted',
      promotedThreadId: thread.id,
      linkedTaskId: entry.threadMeta?.linkedTaskId,
      originIntentId: entry.threadMeta?.originIntentId,
    });
    if (sourceThread) {
      const next = materializeStructuredThread({
        ...sourceThread,
        intents: sourceThread.intents.map((item) =>
          item.id === entry.threadMeta?.originIntentId
            ? { ...item, state: 'parked', linkedSparkId: entry.id, updatedAt: Date.now() }
            : item,
        ),
        sparkContainers: sourceThread.sparkContainers.map((item) =>
          item.streamEntryId === entry.id
            ? { ...item, promotedThreadId: thread.id, updatedAt: Date.now() }
            : item,
        ),
        updatedAt: Date.now(),
      });
      const saved = await persistThread(next);
      const event = createEvent(
        sourceThread.id,
        'spark_promoted',
        'user',
        `Created thread from spark: ${summarizeText(entry.content, 48) || entry.id}`,
        undefined,
        { streamEntryId: entry.id, promotedThreadId: thread.id },
      );
      await persistEvent(event);
      set((state) => ({
        currentThread:
          state.currentThread?.id === saved.id ? saved : state.currentThread,
        threads: updateThreadInList(state.threads, saved),
        currentEvents:
          state.currentThread?.id === saved.id
            ? [event, ...state.currentEvents.filter((timeline) => timeline.threadId === saved.id)]
            : state.currentEvents,
      }));
    }
  },

  createTaskFromSpark: async (entryId) => {
    const entry = useStreamStore.getState().entries.find((item) => item.id === entryId);
    const current = get().currentThread;
    if (!entry || !current) return;
    const taskId = await useStreamStore.getState().enrichEntry(entryId);
    const updatedEntry = await updateSparkThreadMeta(entry, {
      sourceThreadId: entry.threadMeta?.sourceThreadId,
      sparkState: 'tasked',
      promotedThreadId: entry.threadMeta?.promotedThreadId,
      linkedTaskId: taskId,
      originIntentId: entry.threadMeta?.originIntentId,
    });
    const next = materializeStructuredThread({
      ...current,
      intents: current.intents.map((item) =>
        item.id === updatedEntry.threadMeta?.originIntentId
          ? {
              ...item,
              linkedSparkId: updatedEntry.id,
              linkedTaskId: taskId,
              state: 'done',
              updatedAt: Date.now(),
            }
          : item,
      ),
      explorationBlocks: current.explorationBlocks.map((block) =>
        block.anchor.refId === updatedEntry.id ? { ...block, updatedAt: Date.now() } : block,
      ),
      sparkContainers: current.sparkContainers.map((item) =>
        item.streamEntryId === updatedEntry.id
          ? { ...item, linkedTaskId: taskId, updatedAt: Date.now() }
          : item,
      ),
      updatedAt: Date.now(),
    });
    const saved = await persistThread(next);
    const event = createEvent(
      current.id,
      'spark_tasked',
      'user',
      `Created task from spark: ${summarizeText(updatedEntry.content, 48) || updatedEntry.id}`,
      undefined,
      { streamEntryId: updatedEntry.id, taskId },
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: [event, ...state.currentEvents.filter((timeline) => timeline.threadId === saved.id)],
    }));
  },

  archiveSpark: async (entryId) => {
    const entry = useStreamStore.getState().entries.find((item) => item.id === entryId);
    const current = get().currentThread;
    if (!entry || !current) return;
    const updatedEntry = await updateSparkThreadMeta(entry, {
      sourceThreadId: entry.threadMeta?.sourceThreadId,
      sparkState: 'archived',
      promotedThreadId: entry.threadMeta?.promotedThreadId,
      linkedTaskId: entry.threadMeta?.linkedTaskId,
      originIntentId: entry.threadMeta?.originIntentId,
    });
    const next = materializeStructuredThread({
      ...current,
      intents: current.intents.map((item) =>
        item.id === updatedEntry.threadMeta?.originIntentId
          ? { ...item, state: 'archived', linkedSparkId: updatedEntry.id, updatedAt: Date.now() }
          : item,
      ),
      sparkContainers: current.sparkContainers.map((item) =>
        item.streamEntryId === updatedEntry.id ? { ...item, updatedAt: Date.now() } : item,
      ),
      updatedAt: Date.now(),
    });
    const saved = await persistThread(next);
    const event = createEvent(
      current.id,
      'spark_linked',
      'user',
      `Archived spark: ${summarizeText(updatedEntry.content, 48) || updatedEntry.id}`,
      undefined,
      { streamEntryId: updatedEntry.id },
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: [event, ...state.currentEvents.filter((timeline) => timeline.threadId === current.id)],
    }));
  },

  captureToCurrentThread: async (content, source = 'editor') => {
    const current = get().currentThread;
    const trimmed = content.replace(/\r\n/g, '\n').trim();
    if (!current || !trimmed) return false;
    const draft = {
      ...applyDocInsertion(
        current,
        normalizeWorkThreadFocus(current, get().workspaceFocus),
        'body',
        trimmed,
      ),
      updatedAt: Date.now(),
    };
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

  addNextAction: async (text, source = 'user', options) => {
    const current = get().currentThread;
    if (!current || !text.trim()) return null;
    const parent =
      options?.parentIntentId || options?.parentSparkId
        ? {
            parentIntentId: options.parentIntentId,
            parentSparkId: options.parentSparkId,
          }
        : undefined;
    if (options?.insertIntoDoc) {
      const insertionFocus = resolveDocInsertionFocus(current, get().workspaceFocus, parent);
      const next = {
        ...applyDocInsertion(
          current,
          insertionFocus,
          'next',
          text,
        ),
        updatedAt: Date.now(),
      };
      const created = pickNewestNextAction(next, text, parent);
      const saved = await persistThread({
        ...next,
        resumeCard:
          current.resumeCard.nextStep || !created
            ? next.resumeCard
            : {
                ...next.resumeCard,
                nextStep: created.text,
                updatedAt: Date.now(),
              },
      });
      const event =
        options?.recordEvent === false || !created
          ? null
          : createEvent(current.id, 'next_action_added', source, `Added next action: ${created.text}`);
      if (event) {
        await persistEvent(event);
      }
      set((state) => ({
        currentThread: saved,
        threads: updateThreadInList(state.threads, saved),
        currentEvents: event ? [event, ...state.currentEvents] : state.currentEvents,
        persistedDocMarkdown: saved.docMarkdown,
        docDirty: false,
      }));
      return created;
    }
    const action = {
      ...buildNextAction(text, source),
      parentThreadId: current.id,
      parentIntentId: options?.parentIntentId,
      parentSparkId: options?.parentSparkId,
    };
    const next = materializeStructuredThread({
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
    const event =
      options?.recordEvent === false
        ? null
        : createEvent(current.id, 'next_action_added', source, `Added next action: ${action.text}`);
    if (event) {
      await persistEvent(event);
    }
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: event ? [event, ...state.currentEvents] : state.currentEvents,
    }));
    return action;
  },

  updateNextAction: async (id, patch) => {
    const current = get().currentThread;
    if (!current) return;
    const next = materializeStructuredThread({
      ...current,
      nextActions: current.nextActions.map((item) =>
        item.id === id
          ? {
              ...item,
              text: patch.text?.trim() ?? item.text,
              done: patch.done ?? item.done,
            }
          : item,
      ),
      updatedAt: Date.now(),
    });
    const saved = await persistThread(next);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      persistedDocMarkdown: saved.docMarkdown,
    }));
  },

  captureSelectionAsNextAction: async (content, nextDocMarkdown, actionOverride) => {
    const current = get().currentThread;
    const trimmed = content.replace(/\r\n/g, '\n').trim();
    if (!current || !trimmed) return null;
    const action = actionOverride ?? buildNextAction(trimmed, 'user');
    const existingActions = current.nextActions.some((item) => item.id === action.id)
      ? current.nextActions.map((item) =>
          item.id === action.id ? { ...item, text: trimmed } : item,
        )
      : [{ ...action, text: trimmed }, ...current.nextActions];
    const existingAnchors = current.inlineAnchors.some((item) => item.refId === action.id)
      ? current.inlineAnchors.map((item) =>
          item.refId === action.id
            ? {
                ...item,
                marker: formatNextRefMarkdown({ id: action.id, text: trimmed }),
                updatedAt: Date.now(),
              }
            : item,
        )
      : [buildNextActionAnchor({ ...action, text: trimmed }), ...current.inlineAnchors];
    const next = ensureWorkThreadRuntime({
      ...current,
      docMarkdown: nextDocMarkdown,
      nextActions: existingActions,
      inlineAnchors: existingAnchors,
      resumeCard:
        current.resumeCard.nextStep
          ? current.resumeCard
          : {
              ...current.resumeCard,
              nextStep: trimmed,
              updatedAt: Date.now(),
            },
      updatedAt: Date.now(),
    });
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const saved = await persistThread(next);
    const event = createEvent(
      current.id,
      'next_action_added',
      'user',
      `Captured next action: ${summarizeText(trimmed, 48) || 'Next step'}`,
      undefined,
      { nextActionId: action.id },
    );
    await persistEvent(event);
    set((state) => ({
      currentThread: saved,
      threads: updateThreadInList(state.threads, saved),
      currentEvents: [event, ...state.currentEvents.filter((entry) => entry.threadId === saved.id)],
      docDirty: false,
      persistedDocMarkdown: saved.docMarkdown,
    }));
    return action;
  },

  toggleNextActionDone: async (id) => {
    const current = get().currentThread;
    if (!current) return;
    const next = materializeStructuredThread({
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

  setWorkspaceFocus: (focus) => {
    set({
      workspaceFocus: normalizeWorkThreadFocus(get().currentThread, focus),
    });
  },

  requestWorkspaceAutoFocus: (id) => {
    set({ workspaceAutoFocusId: id });
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
