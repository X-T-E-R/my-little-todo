import { AnimatePresence, motion } from 'framer-motion';
import { CheckSquare, Focus, Loader2, Settings, Wind } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreateTaskDialog } from './components/CreateTaskDialog';
import { OfflineIndicator } from './components/OfflineIndicator';
import { QuickInputBar } from './components/QuickInputBar';
import { SyncConflictDialog } from './components/SyncConflictDialog';
import { SyncIndicator } from './components/SyncIndicator';
import { RoleLandingCard } from './components/RoleLandingCard';
import { RoleSidebar } from './components/RoleSidebar';
import { TaskDetailPanel } from './components/TaskDetailPanel';
import { ToastContainer } from './components/Toast';
import { getSetting } from './storage/settingsApi';
import {
  useRoleStore,
  useScheduleStore,
  useShortcutStore,
  useStreamStore,
  useTaskStore,
} from './stores';
import { useAuthStore } from './stores/authStore';
import { startReminderService } from './utils/notificationService';
import { isNativeClient } from './utils/platform';
import { useIsMobile } from './utils/useIsMobile';
import { useShortcuts } from './utils/useShortcuts';
import { BoardView } from './views/BoardView';
import { NowView } from './views/NowView';
import { OnboardingView } from './views/OnboardingView';
import { SettingsView } from './views/SettingsView';
import { StreamView } from './views/StreamView';

const LoginView = React.lazy(() =>
  import('./views/LoginView').then((m) => ({ default: m.LoginView })),
);

type View = 'now' | 'stream' | 'board' | 'settings';

const TAB_CONFIG = [
  { key: 'now' as const, labelKey: 'Now', icon: Focus },
  { key: 'stream' as const, labelKey: 'Stream', icon: Wind },
  { key: 'board' as const, labelKey: 'Tasks', icon: CheckSquare },
  { key: 'settings' as const, labelKey: 'Settings', icon: Settings },
];

export function App() {
  const { t } = useTranslation('nav');
  const [currentView, setCurrentView] = useState<View>('now');
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showQuickInput, setShowQuickInput] = useState(false);
  const [direction, setDirection] = useState(0);
  const loadStream = useStreamStore((s) => s.load);
  const loadTasks = useTaskStore((s) => s.load);
  const loadRoles = useRoleStore((s) => s.load);
  const loadShortcuts = useShortcutStore((s) => s.load);
  const loadSchedules = useScheduleStore((s) => s.load);

  const { authMode, token, loading: authLoading, checkAuthMode, checkAuth } = useAuthStore();
  const native = isNativeClient();
  const [authChecked, setAuthChecked] = useState(native);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    checkAuthMode();
  }, [checkAuthMode]);

  useEffect(() => {
    if (native) return;
    if (authLoading) return;
    if (authMode === 'none') {
      setAuthChecked(true);
      return;
    }
    if (!token) {
      setAuthChecked(true);
      return;
    }
    checkAuth().then(() => setAuthChecked(true));
  }, [native, authLoading, authMode, token, checkAuth]);

  useEffect(() => {
    if (!authChecked) return;
    if (authMode !== 'none' && !token) return;
    loadStream();
    loadTasks();
    loadRoles();
    loadShortcuts();
    loadSchedules();
    startReminderService();
    getSetting('onboarding-completed')
      .then((val) => {
        if (val === 'true') {
          localStorage.setItem('mlt-onboarding-completed', 'true');
        }
        setShowOnboarding(
          val !== 'true' && localStorage.getItem('mlt-onboarding-completed') !== 'true',
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
    loadSchedules,
  ]);

  const handleNewTask = useCallback(() => setShowQuickInput((v) => !v), []);

  const globalHandlers = useMemo(
    () => ({
      'app.newTask': () => handleNewTask(),
      'app.viewNow': () => handleViewChange('now'),
      'app.viewStream': () => handleViewChange('stream'),
      'app.viewBoard': () => handleViewChange('board'),
      'app.viewSettings': () => handleViewChange('settings'),
    }),
    [handleNewTask],
  );

  useShortcuts('global', globalHandlers);

  const isMobile = useIsMobile();

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
        <Loader2 size={32} className="animate-spin text-[var(--color-accent)]" />
      </div>
    );
  }

  if (authMode !== 'none' && !token) {
    return (
      <React.Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
            <Loader2 size={32} className="animate-spin text-[var(--color-accent)]" />
          </div>
        }
      >
        <LoginView />
      </React.Suspense>
    );
  }

  if (showOnboarding === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
        <Loader2 size={32} className="animate-spin text-[var(--color-accent)]" />
      </div>
    );
  }

  if (showOnboarding) {
    return <OnboardingView onComplete={() => setShowOnboarding(false)} />;
  }

  const handleViewChange = (newView: View) => {
    if (newView === currentView) return;
    const currentIndex = TAB_CONFIG.findIndex((t) => t.key === currentView);
    const newIndex = TAB_CONFIG.findIndex((t) => t.key === newView);
    setDirection(newIndex > currentIndex ? 1 : -1);
    setCurrentView(newView);
  };

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 24 : -24, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir < 0 ? 24 : -24, opacity: 0 }),
  };

  return (
    <div
      className="flex h-full flex-col sm:flex-row bg-[var(--color-bg)]"
      style={{ paddingTop: 'var(--safe-area-top)' }}
    >
      {!isMobile && currentView !== 'settings' && <RoleSidebar />}

      <div className="flex flex-1 flex-col min-w-0">
        {isMobile && currentView !== 'settings' && <RoleSidebar horizontal />}

        <main className="relative flex-1 overflow-hidden">
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
                <NowView onNavigateToStream={() => handleViewChange('stream')} />
              )}
              {currentView === 'stream' && <StreamView />}
              {currentView === 'board' && <BoardView />}
              {currentView === 'settings' && <SettingsView />}
            </motion.div>
          </AnimatePresence>

          <RoleLandingCard />

          <QuickInputBar open={showQuickInput} onClose={() => setShowQuickInput(false)} />
        </main>

        <nav
          className="relative z-10 flex border-t border-[var(--color-border)] bg-[var(--color-surface)]/80 px-2 pt-1.5 backdrop-blur-md"
          style={{ paddingBottom: 'calc(8px + var(--safe-area-bottom))' }}
        >
          {TAB_CONFIG.map((tab) => {
            const isActive = currentView === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleViewChange(tab.key)}
                className={`relative flex flex-1 flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors ${
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

        <CreateTaskDialog open={showCreateTask} onClose={() => setShowCreateTask(false)} />
        <TaskDetailPanel />
      </div>

      <ToastContainer />
      <OfflineIndicator />
      <SyncIndicator />
      <SyncConflictDialog />
    </div>
  );
}
