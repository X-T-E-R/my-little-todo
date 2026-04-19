import { AnimatePresence, motion } from 'framer-motion';
import { CheckSquare, FileText, Focus, Loader2, Settings, Wind } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreateTaskDialog } from './components/CreateTaskDialog';
import { EnergyIndicator } from './components/EnergyIndicator';
import { QuickInputBar } from './components/QuickInputBar';
import { RoleLandingCard } from './components/RoleLandingCard';
import { RoleSidebar } from './components/RoleSidebar';
import { ToastContainer } from './components/Toast';
import { useForegroundBridge } from './hooks/useForegroundBridge';
import { useModuleStore } from './modules';
import { ensureBuiltinSettingsRegistered } from './settings/registerBuiltinSettings';
import { getSetting } from './storage/settingsApi';
import {
  ensureFocusSessionHydrated,
  useCoachActivityStore,
  useExecCoachStore,
  useFocusSessionStore,
  useRoleStore,
  useShortcutStore,
  useStreamStore,
  useTaskStore,
  useThinkSessionStore,
  useTimeAwarenessStore,
  useWorkThreadStore,
} from './stores';
import { useAuthStore } from './stores/authStore';
import { useToastStore } from './stores/toastStore';
import { startReminderService } from './utils/notificationService';
import { isNativeClient } from './utils/platform';
import { matchesShortcut } from './utils/shortcuts';
import { useIsMobile } from './utils/useIsMobile';
import { useShortcuts } from './utils/useShortcuts';
import { NowView } from './views/NowView';
import { OnboardingView } from './views/OnboardingView';

const AiChatPanel = React.lazy(() =>
  import('./components/AiChatPanel').then((m) => ({ default: m.AiChatPanel })),
);
const BrainDumpOverlay = React.lazy(() =>
  import('./components/BrainDumpOverlay').then((m) => ({ default: m.BrainDumpOverlay })),
);
const FocusModeOverlay = React.lazy(() =>
  import('./components/FocusModeOverlay').then((m) => ({ default: m.FocusModeOverlay })),
);
const BoardView = React.lazy(() =>
  import('./views/BoardView').then((m) => ({ default: m.BoardView })),
);
const LoginView = React.lazy(() =>
  import('./views/LoginView').then((m) => ({ default: m.LoginView })),
);
const SettingsView = React.lazy(() =>
  import('./views/SettingsView').then((m) => ({ default: m.SettingsView })),
);
const StreamView = React.lazy(() =>
  import('./views/StreamView').then((m) => ({ default: m.StreamView })),
);
const WorkThreadView = React.lazy(() =>
  import('./components/WorkThreadView').then((m) => ({ default: m.WorkThreadView })),
);
const TaskDetailPanel = React.lazy(() =>
  import('./components/TaskDetailPanel').then((m) => ({ default: m.TaskDetailPanel })),
);

type View = 'now' | 'thread' | 'stream' | 'board' | 'settings';
type ShowToast = ReturnType<typeof useToastStore.getState>['showToast'];

function ForegroundBridgeHost() {
  useForegroundBridge();
  return null;
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main
      className="flex h-screen items-center justify-center bg-[var(--color-bg)]"
      aria-busy="true"
      aria-label={label}
    >
      <Loader2 size={32} className="animate-spin text-[var(--color-accent)]" aria-hidden="true" />
    </main>
  );
}

const TAB_CONFIG = [
  { key: 'now' as const, labelKey: 'Now', icon: Focus },
  { key: 'thread' as const, labelKey: 'Thread', icon: FileText },
  { key: 'stream' as const, labelKey: 'Stream', icon: Wind },
  { key: 'board' as const, labelKey: 'Tasks', icon: CheckSquare },
  { key: 'settings' as const, labelKey: 'Settings', icon: Settings },
];

async function hydratePluginsAndModules(hydrateModules: () => Promise<void>) {
  const { usePluginStore } = await import('./plugins/pluginStore');
  const { activatePlugin } = await import('./plugins/pluginRuntime');
  const { isTauriEnv } = await import('./utils/platform');
  await usePluginStore.getState().hydrate();
  await hydrateModules();
  if (isTauriEnv()) {
    const { useEmbeddedHostStore } = await import('./features/embedded-host/embeddedHostStore');
    await useEmbeddedHostStore.getState().hydrate();
  }
  for (const plugin of Object.values(usePluginStore.getState().plugins)) {
    if (!plugin.enabled) continue;
    try {
      await activatePlugin(plugin.id, plugin.manifest);
    } catch (error) {
      console.error('[plugins] activate failed', plugin.id, error);
    }
  }
}

function useAppInitialization({
  authChecked,
  authMode,
  token,
  loadStream,
  loadTasks,
  loadRoles,
  loadShortcuts,
  loadTimeAwareness,
  loadExecCoach,
  loadCoachActivity,
  hydrateModules,
  setShowOnboarding,
}: {
  authChecked: boolean;
  authMode: string | null;
  token: string | null;
  loadStream: () => Promise<void>;
  loadTasks: () => Promise<void>;
  loadRoles: () => Promise<void>;
  loadShortcuts: () => Promise<void>;
  loadTimeAwareness: () => Promise<void>;
  loadExecCoach: () => Promise<void>;
  loadCoachActivity: () => Promise<void>;
  hydrateModules: () => Promise<void>;
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean | null>>;
}) {
  useEffect(() => {
    if (!authChecked) return;
    if (authMode && !token) return;

    loadStream();
    loadTasks();
    loadRoles();
    loadShortcuts();
    loadTimeAwareness();
    loadExecCoach();
    loadCoachActivity();
    void ensureFocusSessionHydrated();
    void hydratePluginsAndModules(hydrateModules);
    startReminderService();
    getSetting('onboarding-completed')
      .then((value) => {
        if (value === 'true') {
          localStorage.setItem('mlt-onboarding-completed', 'true');
        }
        setShowOnboarding(
          value !== 'true' && localStorage.getItem('mlt-onboarding-completed') !== 'true',
        );
      })
      .catch(() => {
        setShowOnboarding(localStorage.getItem('mlt-onboarding-completed') !== 'true');
      });
  }, [
    authChecked,
    authMode,
    token,
    loadStream,
    loadTasks,
    loadRoles,
    loadShortcuts,
    loadTimeAwareness,
    loadExecCoach,
    loadCoachActivity,
    hydrateModules,
    setShowOnboarding,
  ]);
}

function useNativeDesktopBindings({
  native,
  selectTask,
  handleViewChange,
}: {
  native: boolean;
  selectTask: (taskId: string | null) => void;
  handleViewChange: (view: View) => void;
}) {
  useEffect(() => {
    if (!native) return;
    let unlistenTask: (() => void) | undefined;
    let unlistenTray: (() => void) | undefined;

    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const { ensureWidgetWindow } = await import('./utils/desktopWidget');
      const { getSetting } = await import('./storage/settingsApi');
      unlistenTask = await listen<{ taskId: string }>('mlt-focus-task', (event) => {
        selectTask(event.payload.taskId);
        handleViewChange(useModuleStore.getState().isEnabled('kanban') ? 'board' : 'now');
      });
      unlistenTray = await listen('tray-open-widget', async () => {
        const mode = await getSetting('plugin:desktop-widget:display-mode');
        await ensureWidgetWindow(mode === 'pin' ? 'pin' : 'overlay');
      });
    })();

    return () => {
      unlistenTask?.();
      unlistenTray?.();
    };
  }, [native, selectTask, handleViewChange]);
}

function useWelcomeBackToast(showToast: ShowToast, tCoach: (key: string) => string) {
  useEffect(() => {
    if (!useModuleStore.getState().isEnabled('ai-coach')) return;
    const last = sessionStorage.getItem('mlt-coach-last-visit');
    const now = Date.now();
    if (last && now - Number(last) > 8 * 3600000) {
      showToast({ message: tCoach('Welcome back'), type: 'info', duration: 2800 });
    }
    sessionStorage.setItem('mlt-coach-last-visit', String(now));
  }, [showToast, tCoach]);
}

async function maybeShowTimeCapsuleToast(
  showToast: ShowToast,
  tStream: (key: string, options?: Record<string, unknown>) => string,
  cancelledRef: { current: boolean },
) {
  if (!useModuleStore.getState().isEnabled('time-capsule')) return;
  const { getSetting } = await import('./storage/settingsApi');
  const enabled = (await getSetting('time-capsule-enabled')) === 'true';
  if (!enabled) return;
  const last = Number(localStorage.getItem('mlt-capsule-last') || '0');
  if (Date.now() - last < 25 * 60 * 1000) return;
  if (Math.random() > 0.09) return;

  const { pickTimeCapsuleEntry } = await import('./storage/streamRepo');
  const entry = await pickTimeCapsuleEntry(30);
  if (cancelledRef.current || !entry) return;

  localStorage.setItem('mlt-capsule-last', String(Date.now()));
  showToast({
    type: 'info',
    message: tStream('Time capsule hint', { preview: entry.content.slice(0, 160) }),
    duration: 14000,
  });
}

function useTimeCapsuleToast(
  showToast: ShowToast,
  tStream: (key: string, options?: Record<string, unknown>) => string,
) {
  useEffect(() => {
    const cancelledRef = { current: false };
    const id = window.setInterval(
      () => {
        void maybeShowTimeCapsuleToast(showToast, tStream, cancelledRef);
      },
      10 * 60 * 1000,
    );

    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [showToast, tStream]);
}

function useNavigationEvents(handleViewChange: (view: View) => void) {
  useEffect(() => {
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: View }>).detail;
      if (!detail?.view) return;
      handleViewChange(detail.view);
    };
    window.addEventListener('mlt-navigate', onNavigate);
    return () => window.removeEventListener('mlt-navigate', onNavigate);
  }, [handleViewChange]);

  useEffect(() => {
    const onOpenStreamEntry = () => {
      handleViewChange('stream');
    };
    window.addEventListener('mlt-open-stream-entry', onOpenStreamEntry);
    return () => window.removeEventListener('mlt-open-stream-entry', onOpenStreamEntry);
  }, [handleViewChange]);
}

function useBrainDumpHotkey(
  enabled: boolean,
  shortcut: string | null | undefined,
  onOpen: () => void,
) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (shortcut && matchesShortcut(event, shortcut)) {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, shortcut, onOpen]);
}

function useThinkSessionHotkey(
  enabled: boolean,
  shortcut: string | null | undefined,
  handleViewChange: (view: View) => void,
) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (shortcut && matchesShortcut(event, shortcut)) {
        event.preventDefault();
        openThinkSession(handleViewChange);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, shortcut, handleViewChange]);
}

function useWorkThreadHotkey(
  enabled: boolean,
  shortcut: string | null | undefined,
  handleViewChange: (view: View) => void,
) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (shortcut && matchesShortcut(event, shortcut)) {
        event.preventDefault();
        openWorkThread(handleViewChange);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, shortcut, handleViewChange]);
}

function openThinkSession(handleViewChange: (view: View) => void) {
  useThinkSessionStore.getState().setStreamMode('think-session');
  handleViewChange('stream');
}

function openWorkThread(handleViewChange: (view: View) => void, threadId?: string) {
  if (threadId) {
    void useWorkThreadStore.getState().dispatchThread(threadId, 'now');
  }
  handleViewChange('thread');
}

function AppViewContent({
  currentView,
  direction,
  handleViewChange,
  brainDumpEnabled,
  thinkSessionEnabled,
  workThreadEnabled,
  onOpenBrainDump,
  t,
}: {
  currentView: View;
  direction: number;
  handleViewChange: (view: View) => void;
  brainDumpEnabled: boolean;
  thinkSessionEnabled: boolean;
  workThreadEnabled: boolean;
  onOpenBrainDump: () => void;
  t: (key: string) => string;
}) {
  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 24 : -24, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir < 0 ? 24 : -24, opacity: 0 }),
  };

  return (
    <AnimatePresence initial={false} custom={direction} mode="popLayout">
      <motion.div
        key={currentView}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="absolute inset-0 h-full w-full"
      >
        {currentView === 'now' && (
          <NowView
            onNavigateToStream={() => handleViewChange('stream')}
            onBrainDump={brainDumpEnabled ? onOpenBrainDump : undefined}
            onOpenThinkSession={
              thinkSessionEnabled ? () => openThinkSession(handleViewChange) : undefined
            }
            onOpenWorkThread={
              workThreadEnabled ? (threadId?: string) => openWorkThread(handleViewChange, threadId) : undefined
            }
          />
        )}
        {currentView === 'stream' && (
          <React.Suspense fallback={<LoadingScreen label={t('Loading')} />}>
            <StreamView />
          </React.Suspense>
        )}
        {currentView === 'thread' && (
          <React.Suspense fallback={<LoadingScreen label={t('Loading')} />}>
            <WorkThreadView onGoNow={() => handleViewChange('now')} />
          </React.Suspense>
        )}
        {currentView === 'board' && (
          <React.Suspense fallback={<LoadingScreen label={t('Loading')} />}>
            <BoardView />
          </React.Suspense>
        )}
        {currentView === 'settings' && (
          <React.Suspense fallback={<LoadingScreen label={t('Loading')} />}>
            <SettingsView />
          </React.Suspense>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function BottomNav({
  currentView,
  energyEnabled,
  visibleTabs,
  handleViewChange,
  t,
}: {
  currentView: View;
  energyEnabled: boolean;
  visibleTabs: typeof TAB_CONFIG;
  handleViewChange: (view: View) => void;
  t: (key: string) => string;
}) {
  return (
    <nav
      role="tablist"
      aria-label={t('Main navigation')}
      className="relative z-10 flex items-stretch gap-1 border-t border-[var(--color-border)] bg-[var(--color-surface)]/80 px-1 pt-1.5 backdrop-blur-md"
      style={{ paddingBottom: 'calc(8px + var(--safe-area-bottom))' }}
    >
      <div className="flex shrink-0 items-center justify-center gap-1 px-1">
        {energyEnabled && <EnergyIndicator />}
      </div>
      {visibleTabs.map((tab) => {
        const isActive = currentView === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={t(tab.labelKey)}
            onClick={() => handleViewChange(tab.key)}
            className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors ${
              isActive
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <tab.icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
            <span className="text-[10px] font-medium leading-tight">{t(tab.labelKey)}</span>
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className="absolute -top-1.5 h-0.5 w-8 rounded-full bg-[var(--color-accent)]"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

export function App() {
  ensureBuiltinSettingsRegistered();
  const { t } = useTranslation('nav');
  const { t: tCoach } = useTranslation('coach');
  const { t: tStream } = useTranslation('stream');
  const [currentView, setCurrentView] = useState<View>('now');
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showQuickInput, setShowQuickInput] = useState(false);
  const [showBrainDump, setShowBrainDump] = useState(false);
  const [direction, setDirection] = useState(0);
  const loadStream = useStreamStore((s) => s.load);
  const loadTasks = useTaskStore((s) => s.load);
  const selectTask = useTaskStore((s) => s.selectTask);
  const loadRoles = useRoleStore((s) => s.load);
  const loadShortcuts = useShortcutStore((s) => s.load);
  const loadTimeAwareness = useTimeAwarenessStore((s) => s.load);
  const loadExecCoach = useExecCoachStore((s) => s.load);
  const loadCoachActivity = useCoachActivityStore((s) => s.load);
  const touchAppOpen = useExecCoachStore((s) => s.touchAppOpen);
  const showToast = useToastStore((s) => s.showToast);
  const focusSession = useFocusSessionStore((s) => s.session);
  const updateFocusSession = useFocusSessionStore((s) => s.updateSession);
  const hideChromeForLock = !!focusSession?.locked && !focusSession?.peeking;
  const hydrateModules = useModuleStore((s) => s.hydrate);
  const kanbanEnabled = useModuleStore((s) => s.isEnabled('kanban'));
  const energyEnabled = useModuleStore((s) => s.isEnabled('energy-indicator'));
  const brainDumpEnabled = useModuleStore((s) => s.isEnabled('brain-dump'));
  const thinkSessionEnabled = useModuleStore((s) => s.isEnabled('think-session'));
  const workThreadEnabled = useModuleStore((s) => s.isEnabled('work-thread'));
  const visibleTabs = useMemo(
    () =>
      TAB_CONFIG.filter((tab) => {
        if (tab.key === 'board') return kanbanEnabled;
        if (tab.key === 'thread') return workThreadEnabled;
        return true;
      }),
    [kanbanEnabled, workThreadEnabled],
  );

  const { authMode, token, loading: authLoading, checkAuthMode, checkAuth } = useAuthStore();
  const native = isNativeClient();
  const [authChecked, setAuthChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    checkAuthMode();
  }, [checkAuthMode]);

  useEffect(() => {
    if (authLoading) return;
    if (!authMode || !token) {
      setAuthChecked(true);
      return;
    }
    checkAuth().then(() => setAuthChecked(true));
  }, [authLoading, authMode, token, checkAuth]);

  const handleViewChange = useCallback((newView: View) => {
    if (newView === 'board' && !useModuleStore.getState().isEnabled('kanban')) return;
    if (newView === 'thread' && !useModuleStore.getState().isEnabled('work-thread')) return;
    setCurrentView((previousView) => {
      if (newView === previousView) return previousView;
      const tabs = TAB_CONFIG.filter((tab) => {
        if (tab.key === 'board') return useModuleStore.getState().isEnabled('kanban');
        if (tab.key === 'thread') return useModuleStore.getState().isEnabled('work-thread');
        return true;
      });
      const currentIndex = tabs.findIndex((tab) => tab.key === previousView);
      const newIndex = tabs.findIndex((tab) => tab.key === newView);
      setDirection(newIndex > currentIndex ? 1 : -1);
      return newView;
    });
  }, []);

  useAppInitialization({
    authChecked,
    authMode,
    token,
    loadStream,
    loadTasks,
    loadRoles,
    loadShortcuts,
    loadTimeAwareness,
    loadExecCoach,
    loadCoachActivity,
    hydrateModules,
    setShowOnboarding,
  });
  useNativeDesktopBindings({ native, selectTask, handleViewChange });
  useWelcomeBackToast(showToast, tCoach);
  useTimeCapsuleToast(showToast, tStream);
  useNavigationEvents(handleViewChange);

  useEffect(() => {
    if (!kanbanEnabled && currentView === 'board') handleViewChange('now');
  }, [kanbanEnabled, currentView, handleViewChange]);

  useEffect(() => {
    if (!workThreadEnabled && currentView === 'thread') handleViewChange('now');
  }, [workThreadEnabled, currentView, handleViewChange]);

  useEffect(() => {
    touchAppOpen();
  }, [touchAppOpen]);

  const brainDumpKeys = useShortcutStore((s) => s.getKeys('plugin.brainDump'));
  const thinkSessionKeys = useShortcutStore((s) => s.getKeys('plugin.thinkSession'));
  const workThreadKeys = useShortcutStore((s) => s.getKeys('plugin.workThread'));
  useBrainDumpHotkey(brainDumpEnabled, brainDumpKeys, () => setShowBrainDump(true));
  useThinkSessionHotkey(thinkSessionEnabled, thinkSessionKeys, handleViewChange);
  useWorkThreadHotkey(workThreadEnabled, workThreadKeys, handleViewChange);

  const handleNewTask = useCallback(() => setShowQuickInput((value) => !value), []);
  const globalHandlers = useMemo(
    () => ({
      'app.newTask': () => handleNewTask(),
      'app.viewNow': () => handleViewChange('now'),
      'app.viewThread': () => {
        if (useModuleStore.getState().isEnabled('work-thread')) handleViewChange('thread');
      },
      'app.viewStream': () => handleViewChange('stream'),
      'app.viewBoard': () => {
        if (useModuleStore.getState().isEnabled('kanban')) handleViewChange('board');
      },
      'app.viewSettings': () => handleViewChange('settings'),
    }),
    [handleNewTask, handleViewChange],
  );
  useShortcuts('global', globalHandlers);

  const isMobile = useIsMobile();

  if (!authChecked) {
    return <LoadingScreen label={t('Loading')} />;
  }

  if (authMode && !token) {
    return (
      <React.Suspense fallback={<LoadingScreen label={t('Loading')} />}>
        <LoginView />
      </React.Suspense>
    );
  }

  if (showOnboarding === null) {
    return <LoadingScreen label={t('Loading')} />;
  }

  if (showOnboarding) {
    return <OnboardingView onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <div
      className="flex h-full flex-col bg-[var(--color-bg)] sm:flex-row"
      style={{ paddingTop: 'var(--safe-area-top)' }}
    >
      {native && <ForegroundBridgeHost />}
      {!hideChromeForLock && !isMobile && currentView !== 'settings' && <RoleSidebar />}

      <div className="flex min-w-0 flex-1 flex-col">
        {!hideChromeForLock && isMobile && currentView !== 'settings' && <RoleSidebar horizontal />}

        <main className="relative flex-1 overflow-hidden">
          <AppViewContent
            currentView={currentView}
            direction={direction}
            handleViewChange={handleViewChange}
            brainDumpEnabled={brainDumpEnabled}
            thinkSessionEnabled={thinkSessionEnabled}
            workThreadEnabled={workThreadEnabled}
            onOpenBrainDump={() => setShowBrainDump(true)}
            t={t}
          />

          <RoleLandingCard />
          <QuickInputBar open={showQuickInput} onClose={() => setShowQuickInput(false)} />
          {brainDumpEnabled && (
            <React.Suspense fallback={null}>
              <BrainDumpOverlay open={showBrainDump} onClose={() => setShowBrainDump(false)} />
            </React.Suspense>
          )}
        </main>

        {!hideChromeForLock && (
          <BottomNav
            currentView={currentView}
            energyEnabled={energyEnabled}
            visibleTabs={visibleTabs}
            handleViewChange={handleViewChange}
            t={t}
          />
        )}

        <CreateTaskDialog open={showCreateTask} onClose={() => setShowCreateTask(false)} />
        <React.Suspense fallback={null}>
          <TaskDetailPanel />
        </React.Suspense>
      </div>

      <React.Suspense fallback={null}>
        <FocusModeOverlay />
      </React.Suspense>
      {focusSession?.locked && focusSession.peeking && (
        <div
          className="pointer-events-auto fixed left-0 right-0 top-0 z-[95] flex items-center justify-between gap-2 border-b px-3 py-2 shadow-sm backdrop-blur-md"
          style={{
            paddingTop: 'calc(8px + var(--safe-area-top))',
            background: 'color-mix(in srgb, var(--color-surface) 92%, transparent)',
            borderColor: 'var(--color-border)',
          }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {tCoach('peek_bar_title')}
          </span>
          <button
            type="button"
            onClick={() => updateFocusSession({ peeking: false })}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{
              background: 'var(--color-accent)',
              color: 'white',
            }}
          >
            {tCoach('peek_back')}
          </button>
        </div>
      )}

      <ToastContainer />
      <React.Suspense fallback={null}>
        <AiChatPanel showLauncher={false} />
      </React.Suspense>
    </div>
  );
}
