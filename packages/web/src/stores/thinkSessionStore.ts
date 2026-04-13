import type { ExtractedAction, ThinkSession, ThinkSessionStartMode } from '@my-little-todo/core';
import { create } from 'zustand';
import i18n from '../locales';
import { getDataStore } from '../storage/dataStore';
import { getSetting } from '../storage/settingsApi';
import { extractActionsFromText, seedContentForMode } from '../utils/thinkSessionAi';
import { useTaskStore } from './taskStore';

function seedI18n() {
  const t = (k: string, o?: Record<string, unknown>) =>
    i18n.t(k, { ns: 'think', ...(o || {}) }) as string;
  return {
    discovery: {
      headline: t('discovery_headline'),
      noActive: t('discovery_no_active'),
      activeCount: (n: number) => t('discovery_active_count', { count: n }),
      ddlSoon: t('discovery_ddl_soon'),
      stale: t('discovery_stale'),
      prompt: t('discovery_prompt'),
    },
    arrange: {
      heading: t('arrange_heading'),
      footer: t('arrange_footer'),
      noDdl: t('arrange_no_ddl'),
    },
  };
}

export type StreamPanelMode = 'stream' | 'think';
export type ThinkWorkspaceMode = 'session' | 'thread';

interface ThinkSessionState {
  streamMode: StreamPanelMode;
  workspaceMode: ThinkWorkspaceMode;
  currentSession: ThinkSession | null;
  /** Bumps when markdown should remount (seed / open history). */
  editorKey: number;
  sessions: ThinkSession[];
  historyOpen: boolean;
  aiBusy: boolean;
  saveError: string | null;

  setStreamMode: (mode: StreamPanelMode) => void;
  setWorkspaceMode: (mode: ThinkWorkspaceMode) => void;
  /** Start or resume editing */
  ensureSession: () => Promise<void>;
  setStartModeAndSeed: (mode: ThinkSessionStartMode) => Promise<void>;
  updateContent: (md: string) => void;
  flushSave: () => Promise<void>;
  loadHistory: () => Promise<void>;
  setHistoryOpen: (open: boolean) => void;
  openSessionReadonly: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  runAiExtract: () => Promise<void>;
  setExtractedActions: (actions: ExtractedAction[]) => void;
  toggleActionAdopted: (id: string) => void;
  applyAdoptedActions: () => Promise<void>;
  clearCurrentSession: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useThinkSessionStore = create<ThinkSessionState>((set, get) => ({
  streamMode: 'stream',
  workspaceMode: 'session',
  currentSession: null,
  editorKey: 0,
  sessions: [],
  historyOpen: false,
  aiBusy: false,
  saveError: null,

  setStreamMode: (mode) => set({ streamMode: mode }),
  setWorkspaceMode: (mode) => set({ workspaceMode: mode }),

  ensureSession: async () => {
    const cur = get().currentSession;
    if (cur) return;
    const now = Date.now();
    const configuredMode = await getSetting('think-session:default-start-mode');
    const startMode: ThinkSessionStartMode =
      configuredMode === 'discovery' || configuredMode === 'arrange' || configuredMode === 'blank'
        ? configuredMode
        : 'blank';
    const tasks = useTaskStore.getState().tasks;
    const content =
      startMode === 'blank' ? '' : await seedContentForMode(startMode, tasks, seedI18n());
    const session: ThinkSession = {
      id: crypto.randomUUID(),
      content,
      startMode,
      createdAt: now,
      updatedAt: now,
    };
    await getDataStore().saveThinkSession(session);
    set({ currentSession: session, editorKey: get().editorKey + 1 });
  },

  setStartModeAndSeed: async (mode) => {
    set({ aiBusy: true, saveError: null });
    try {
      const tasks = useTaskStore.getState().tasks;
      const content = await seedContentForMode(mode, tasks, seedI18n());
      let session = get().currentSession;
      const now = Date.now();
      if (!session) {
        session = {
          id: crypto.randomUUID(),
          content,
          startMode: mode,
          createdAt: now,
          updatedAt: now,
        };
      } else {
        session = {
          ...session,
          content,
          startMode: mode,
          updatedAt: now,
        };
      }
      await getDataStore().saveThinkSession(session);
      set({
        currentSession: session,
        aiBusy: false,
        editorKey: get().editorKey + 1,
      });
    } catch (e) {
      set({
        aiBusy: false,
        saveError: String(e),
      });
    }
  },

  updateContent: (md) => {
    const session = get().currentSession;
    if (!session) return;
    const next = { ...session, content: md };
    set({
      currentSession: next,
    });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void get().flushSave();
    }, 1200);
  },

  flushSave: async () => {
    const session = get().currentSession;
    if (!session) return;
    try {
      const toSave = { ...session, updatedAt: Date.now() };
      await getDataStore().saveThinkSession(toSave);
      set({ currentSession: toSave, saveError: null });
    } catch (e) {
      set({ saveError: String(e) });
    }
  },

  loadHistory: async () => {
    const list = await getDataStore().listThinkSessions(200);
    set({ sessions: list });
  },

  setHistoryOpen: (open) => set({ historyOpen: open }),

  openSessionReadonly: async (id) => {
    const s = await getDataStore().getThinkSession(id);
    if (s)
      set({
        currentSession: s,
        historyOpen: false,
        editorKey: get().editorKey + 1,
      });
  },

  deleteSession: async (id) => {
    await getDataStore().deleteThinkSession(id);
    const cur = get().currentSession;
    if (cur?.id === id) {
      set({ currentSession: null });
    }
    await get().loadHistory();
  },

  runAiExtract: async () => {
    const session = get().currentSession;
    if (!session?.content.trim()) return;
    set({ aiBusy: true, saveError: null });
    try {
      const tasks = useTaskStore.getState().tasks;
      const actions = await extractActionsFromText(session.content, tasks);
      const next = {
        ...session,
        extractedActions: actions,
        updatedAt: Date.now(),
      };
      await getDataStore().saveThinkSession(next);
      set({ currentSession: next, aiBusy: false });
    } catch (e) {
      set({ aiBusy: false, saveError: String(e) });
    }
  },

  setExtractedActions: (actions) => {
    const session = get().currentSession;
    if (!session) return;
    set({
      currentSession: { ...session, extractedActions: actions, updatedAt: Date.now() },
    });
  },

  toggleActionAdopted: (id) => {
    const session = get().currentSession;
    if (!session?.extractedActions) return;
    const actions = session.extractedActions.map((a) =>
      a.id === id ? { ...a, adopted: !a.adopted } : a,
    );
    set({
      currentSession: { ...session, extractedActions: actions, updatedAt: Date.now() },
    });
  },

  applyAdoptedActions: async () => {
    const session = get().currentSession;
    if (!session?.extractedActions) return;
    const adopted = session.extractedActions.filter((a) => a.adopted);
    const createTask = useTaskStore.getState().createTask;
    const updateTask = useTaskStore.getState().updateTask;
    const tasks = useTaskStore.getState().tasks;
    const postponeTask = useTaskStore.getState().postponeTask;

    for (const a of adopted) {
      try {
        if (a.type === 'create_task' && a.description.trim()) {
          await createTask(a.description.trim(), {});
        } else if (a.type === 'update_priority' && a.relatedTaskId) {
          const t = tasks.find((x) => x.id === a.relatedTaskId);
          if (t) {
            const p =
              a.suggestedPriority != null
                ? Math.min(10, Math.max(0, a.suggestedPriority * 10))
                : Math.min(10, (t.priority ?? 5) + 1);
            await updateTask({
              ...t,
              priority: p,
              status: t.status === 'inbox' || t.status === 'active' ? 'today' : t.status,
            });
          }
        } else if (a.type === 'postpone' && a.relatedTaskId) {
          const t = tasks.find((x) => x.id === a.relatedTaskId);
          if (t?.ddl) {
            const next = new Date(t.ddl);
            next.setDate(next.getDate() + 3);
            await postponeTask(t.id, 'think-session', next);
          }
        }
      } catch {
        /* continue */
      }
    }

    const next = {
      ...session,
      extractedActions: session.extractedActions.map((x) => ({ ...x, adopted: false })),
      updatedAt: Date.now(),
    };
    await getDataStore().saveThinkSession(next);
    set({ currentSession: next });
    await useTaskStore.getState().load();
  },

  clearCurrentSession: () => {
    set({ currentSession: null, streamMode: 'stream', workspaceMode: 'session' });
  },
}));
