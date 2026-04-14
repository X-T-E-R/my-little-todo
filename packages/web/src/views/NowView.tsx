import type { Task } from '@my-little-todo/core';
import {
  daysUntil,
  displayTaskTitle,
  isOverdue,
  taskRoleIds,
  withTaskRoles,
} from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Coffee, Dices, Lock, NotebookPen, PartyPopper, Sparkles, Wind } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useOpenAiChat } from '../ai/useOpenAiChat';
import { OnboardingTip } from '../components/OnboardingTip';
import { RecommendationHistory } from '../components/RecommendationHistory';
import { RolePillMulti } from '../components/RolePickerPopover';
import { TaskContextMenu } from '../components/TaskContextMenu';
import { useModuleStore } from '../modules';
import { getSetting } from '../storage/settingsApi';
import {
  countTaskSwitchesInWindow,
  ensureFocusSessionHydrated,
  filterByRole,
  formatDdlLabel,
  getRecommendedThread,
  getCurrentTimeContext,
  getTimeSlotSuggestion,
  isInScheduleBlock,
  pickRandom,
  useBehaviorStore,
  useCoachActivityStore,
  useExecCoachStore,
  useFocusSessionStore,
  useNowOverrideStore,
  useRoleStore,
  useTaskStore,
  useTimeAwarenessStore,
  useWorkThreadStore,
} from '../stores';
import type { EnergyLevel } from '../stores/execCoachStore';
import { pickRecommendation } from '../stores/taskStore';
import {
  NOW_DEFAULT_VIEW_KEY,
  NOW_SHOW_AUTO_VIEW_KEY,
  getAvailableNowViews,
  resolveWorkThreadUiPrefs,
  type NowViewMode,
} from '../utils/workThreadUiPrefs';

const REJECTION_REASONS = [
  { id: 'no_conditions', label: 'No conditions to do this now' },
  { id: 'too_big', label: "Too big, don't know where to start" },
  { id: 'dont_want', label: "Just don't want to" },
  { id: 'something_urgent', label: 'Something more urgent' },
] as const;

const GENTLE_INTERVENTIONS = [
  "You've rejected several tasks. Maybe now isn't a good time for work? Take a break.",
  "Rejecting is okay - but if you don't want to do any task, maybe try a different environment or approach.",
  "Consecutive rejections might mean you need a break, or the task breakdown isn't right. Want to adjust?",
];

function pickNowRecommendation(list: Task[], allTasks: Task[], energy: EnergyLevel) {
  const taOn = useModuleStore.getState().isEnabled('time-awareness');
  const blocks = useTimeAwarenessStore.getState().blocks;
  const behaviorEvents = useBehaviorStore.getState().events;
  return pickRecommendation(list, {
    energyLevel: energy,
    allTasks,
    timeAwareness: taOn ? { enabled: true, blocks, behaviorEvents } : undefined,
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: NowView has many states
export function NowView({
  onNavigateToStream,
  onBrainDump,
  onOpenThinkSession,
  onOpenWorkThread,
}: {
  onNavigateToStream?: () => void;
  onBrainDump?: () => void;
  onOpenThinkSession?: () => void;
  onOpenWorkThread?: (threadId?: string) => void;
}) {
  const { t } = useTranslation('now');
  const { t: tCoach } = useTranslation('coach');
  const { t: tAi } = useTranslation('ai');
  const openAiChat = useOpenAiChat();
  const aiAgentEnabled = useModuleStore((s) => s.isEnabled('ai-agent'));
  const [showRejectPanel, setShowRejectPanel] = useState(false);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [rejectionCount, setRejectionCount] = useState(0);
  const [showIntervention, setShowIntervention] = useState(false);
  const [isOffTime, setIsOffTime] = useState(false);
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);
  const [taskCtxMenu, setTaskCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [lockTick, setLockTick] = useState<number | null>(null);
  const [showRhythmMirror, setShowRhythmMirror] = useState(false);
  const [celebrateLine, setCelebrateLine] = useState<string | null>(null);
  const [focusStoreHydrated, setFocusStoreHydrated] = useState(false);
  const [chosenByUserTaskId, setChosenByUserTaskId] = useState<string | null>(null);
  const [nowViewMode, setNowViewMode] = useState<NowViewMode>('auto');
  const [showAutoView, setShowAutoView] = useState(true);
  const session = useFocusSessionStore((s) => s.session);
  const setSession = useFocusSessionStore((s) => s.setSession);
  const overrideTaskId = useNowOverrideStore((s) => s.overrideTaskId);
  const {
    tasks,
    loading,
    error: taskError,
    load,
    selectTask,
    updateTask,
    updateStatus,
    deleteTask,
  } = useTaskStore();
  const loadThreads = useWorkThreadStore((s) => s.loadThreads);
  const threadSchedulerPolicy = useWorkThreadStore((s) => s.schedulerPolicy);
  const workThreads = useWorkThreadStore((s) => s.threads);
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const filtered = useMemo(() => filterByRole(tasks, currentRoleId), [tasks, currentRoleId]);
  const { recordEvent, load: loadBehavior } = useBehaviorStore();
  const timeAwarenessEnabled = useModuleStore((s) => s.isEnabled('time-awareness'));
  const scheduleBlocks = useTimeAwarenessStore((s) => s.blocks);
  const loadTimeAwareness = useTimeAwarenessStore((s) => s.load);
  const behaviorEvents = useBehaviorStore((s) => s.events);
  const activeSchedule = useMemo(
    () => (timeAwarenessEnabled ? isInScheduleBlock(scheduleBlocks) : null),
    [scheduleBlocks, timeAwarenessEnabled],
  );
  const timeSlotSuggestion = useMemo(
    () =>
      timeAwarenessEnabled
        ? getTimeSlotSuggestion(scheduleBlocks, behaviorEvents)
        : { kind: 'neutral' as const, messageKey: 'time_suggestion_neutral' },
    [timeAwarenessEnabled, scheduleBlocks, behaviorEvents],
  );
  const timeContext = useMemo(
    () => (timeAwarenessEnabled ? getCurrentTimeContext(scheduleBlocks) : null),
    [timeAwarenessEnabled, scheduleBlocks],
  );
  const energyLevel = useExecCoachStore((s) => s.energyLevel);
  const activityEvents = useCoachActivityStore((s) => s.events);
  const loadCoachActivity = useCoachActivityStore((s) => s.load);

  useEffect(() => {
    load();
    loadBehavior();
    loadTimeAwareness();
    loadCoachActivity();
    void loadThreads();
  }, [load, loadBehavior, loadTimeAwareness, loadCoachActivity, loadThreads]);

  useEffect(() => {
    void Promise.all([getSetting(NOW_DEFAULT_VIEW_KEY), getSetting(NOW_SHOW_AUTO_VIEW_KEY)]).then(
      ([defaultView, autoView]) => {
        const prefs = resolveWorkThreadUiPrefs({
          nowDefaultView: defaultView,
          nowShowAutoView: autoView !== 'false',
        });
        setNowViewMode(prefs.nowDefaultView);
        setShowAutoView(prefs.nowShowAutoView);
      },
    );
  }, []);

  const threadRecommendation = useMemo(
    () => getRecommendedThread(tasks),
    [tasks, workThreads, threadSchedulerPolicy],
  );

  const primaryThreadRecommendation =
    threadSchedulerPolicy === 'manual' ? null : threadRecommendation;
  const availableNowViews = getAvailableNowViews(
    resolveWorkThreadUiPrefs({ nowShowAutoView: showAutoView }),
  );
  const displayedNowView = availableNowViews.includes(nowViewMode)
    ? nowViewMode
    : availableNowViews[0];
  const threadItems = useMemo(
    () =>
      [...workThreads]
        .filter((thread) => thread.status !== 'archived')
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 6),
    [workThreads],
  );
  const nowViewTabs = (
    <div
      className="mb-4 inline-flex flex-wrap items-center gap-1 rounded-full border p-1"
      style={{
        borderColor: 'var(--color-border)',
        background: 'color-mix(in srgb, var(--color-surface) 94%, var(--color-bg))',
      }}
    >
      {availableNowViews.map((view) => (
        <button
          key={view}
          type="button"
          onClick={() => setNowViewMode(view)}
          className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: displayedNowView === view ? 'var(--color-accent-soft)' : 'transparent',
            color: displayedNowView === view ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          }}
        >
          {t(`now_view_${view}`)}
        </button>
      ))}
    </div>
  );

  useEffect(() => {
    if (!overrideTaskId || loading) return;
    const t = tasks.find((x) => x.id === overrideTaskId);
    if (t) {
      setCurrentTask(t);
      setSession(null);
      setChosenByUserTaskId(t.id);
      useNowOverrideStore.getState().setOverrideTaskId(null);
      useCoachActivityStore.getState().record({
        type: 'task_focus_start',
        payload: { taskId: t.id, source: 'now_override' },
      });
    } else {
      useNowOverrideStore.getState().setOverrideTaskId(null);
    }
  }, [overrideTaskId, tasks, loading, setSession]);

  useEffect(() => {
    ensureFocusSessionHydrated().finally(() => setFocusStoreHydrated(true));
  }, []);

  useEffect(() => {
    if (!focusStoreHydrated) return;
    if (filtered.length > 0 && !currentTask && !session) {
      setCurrentTask(pickNowRecommendation(filtered, tasks, energyLevel));
    }
  }, [focusStoreHydrated, filtered, currentTask, session, tasks, energyLevel]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset state when role filter changes
  useEffect(() => {
    if (!session) {
      setCurrentTask(pickNowRecommendation(filtered, tasks, energyLevel));
      setRejectionCount(0);
      setShowRejectPanel(false);
      setShowIntervention(false);
    }
  }, [currentRoleId]);

  useEffect(() => {
    const n = countTaskSwitchesInWindow(activityEvents, 30 * 60 * 1000);
    if (n >= 5 && energyLevel === 'high') {
      setShowRhythmMirror(true);
    }
  }, [activityEvents, energyLevel]);

  useEffect(() => {
    if (lockTick === null) return;
    if (lockTick === 0) {
      setLockTick(null);
      if (!currentTask) return;
      recordEvent({
        taskId: currentTask.id,
        taskTitle: displayTaskTitle(currentTask),
        action: 'accepted',
      });
      useCoachActivityStore.getState().record({
        type: 'task_focus_start',
        payload: { taskId: currentTask.id, locked: true },
      });
      setSession({
        taskId: currentTask.id,
        startedAt: new Date(),
        notes: '',
        locked: true,
        peeking: false,
      });
      return;
    }
    const timer = window.setTimeout(() => setLockTick((x) => (x === null ? null : x - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [lockTick, currentTask, recordEvent, setSession]);

  const handleReject = (reasonId: string) => {
    setShowRejectPanel(false);
    if (currentTask) {
      const reason = REJECTION_REASONS.find((r) => r.id === reasonId);
      recordEvent({
        taskId: currentTask.id,
        taskTitle: displayTaskTitle(currentTask),
        action: 'rejected',
        rejectionReason: reason?.label,
      });
    }
    const newCount = rejectionCount + 1;
    setRejectionCount(newCount);

    if (newCount >= 3 && newCount % 3 === 0) {
      setShowIntervention(true);
      return;
    }

    const remaining = filtered.filter((t) => t.id !== currentTask?.id);
    const next = pickNowRecommendation(remaining, tasks, energyLevel);
    setCurrentTask(next);
    if (next) {
      setChosenByUserTaskId(null);
      useCoachActivityStore.getState().record({
        type: 'task_focus_start',
        payload: { taskId: next.id, source: 'now_recommendation' },
      });
    }
  };

  const handleDismissIntervention = () => {
    setShowIntervention(false);
    const remaining = filtered.filter((t) => t.id !== currentTask?.id);
    const next = pickNowRecommendation(remaining, tasks, energyLevel);
    setCurrentTask(next);
    if (next) {
      setChosenByUserTaskId(null);
      useCoachActivityStore.getState().record({
        type: 'task_focus_start',
        payload: { taskId: next.id, source: 'now_recommendation' },
      });
    }
  };

  const handleOffTime = () => {
    setIsOffTime(true);
    setShowIntervention(false);
    setShowRejectPanel(false);
  };

  const handleBackToWork = () => {
    setIsOffTime(false);
    setRejectionCount(0);
    const next = pickNowRecommendation(filtered, tasks, energyLevel);
    setCurrentTask(next);
    if (next) {
      setChosenByUserTaskId(null);
      useCoachActivityStore.getState().record({
        type: 'task_focus_start',
        payload: { taskId: next.id, source: 'now_recommendation' },
      });
    }
  };

  const handleRandom = () => {
    if (session) return;
    if (currentTask) {
      recordEvent({
        taskId: currentTask.id,
        taskTitle: displayTaskTitle(currentTask),
        action: 'swapped',
      });
    }
    const next = pickRandom(filtered);
    setCurrentTask(next);
    if (next) {
      setChosenByUserTaskId(null);
      useCoachActivityStore.getState().record({
        type: 'task_focus_start',
        payload: { taskId: next.id, source: 'now_recommendation' },
      });
    }
  };

  const handleStartWorking = () => {
    if (!currentTask || session) return;
    recordEvent({
      taskId: currentTask.id,
      taskTitle: displayTaskTitle(currentTask),
      action: 'accepted',
    });
    useCoachActivityStore.getState().record({
      type: 'task_focus_start',
      payload: { taskId: currentTask.id, locked: false },
    });
    setSession({
      taskId: currentTask.id,
      startedAt: new Date(),
      notes: '',
      locked: false,
      peeking: false,
    });
  };

  const handleStartLocked = () => {
    if (session || !currentTask || energyLevel === 'low') return;
    setLockTick(3);
  };

  useEffect(() => {
    const onShelved = (ev: Event) => {
      const shelvedId = (ev as CustomEvent<{ taskId: string | null }>).detail?.taskId;
      setChosenByUserTaskId(null);
      const taskList = useTaskStore.getState().tasks;
      const roleId = useRoleStore.getState().currentRoleId;
      const energy = useExecCoachStore.getState().energyLevel;
      const roleFiltered = filterByRole(taskList, roleId);
      const remaining = roleFiltered.filter((t) => t.id !== shelvedId);
      const next = pickNowRecommendation(remaining, taskList, energy);
      setCurrentTask(next);
    };
    let celebrateTimer: ReturnType<typeof setTimeout> | null = null;
    const onCompleted = () => {
      const keys = ['celebrate_a', 'celebrate_b', 'celebrate_c', 'celebrate_d'] as const;
      setCelebrateLine(tCoach(keys[Math.floor(Math.random() * keys.length)] ?? 'celebrate_a'));
      setShowCompletionCelebration(true);
      celebrateTimer = setTimeout(() => {
        setShowCompletionCelebration(false);
        const freshTasks = useTaskStore.getState().tasks;
        const freshFiltered = filterByRole(freshTasks, useRoleStore.getState().currentRoleId);
        setCurrentTask(
          pickNowRecommendation(
            freshFiltered,
            freshTasks,
            useExecCoachStore.getState().energyLevel,
          ),
        );
      }, 2500);
    };
    window.addEventListener('mlt-focus-shelved', onShelved);
    window.addEventListener('mlt-focus-completed', onCompleted);
    return () => {
      window.removeEventListener('mlt-focus-shelved', onShelved);
      window.removeEventListener('mlt-focus-completed', onCompleted);
      if (celebrateTimer) clearTimeout(celebrateTimer);
    };
  }, [tCoach]);

  if (loading && tasks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Loading...')}
        </span>
      </div>
    );
  }

  if (taskError && tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {t('Failed to load tasks')}
        </span>
        <button
          type="button"
          onClick={() => load()}
          className="rounded-lg px-4 py-1.5 text-xs font-medium"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {t('Retry')}
        </button>
      </div>
    );
  }

  if (showCompletionCelebration) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center px-6 overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[100px] pointer-events-none opacity-10"
          style={{ background: 'var(--color-success)' }}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="relative z-10 text-center"
        >
          <PartyPopper
            size={56}
            className="mx-auto mb-4"
            style={{ color: 'var(--color-success)' }}
          />
          <h1 className="text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>
            {t('Done!')}
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {celebrateLine ?? t('Well done')}
          </p>
        </motion.div>
      </div>
    );
  }

  if (session && !session.peeking) {
    return <div className="h-full w-full" aria-hidden />;
  }

  if (isOffTime) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center px-6 overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[100px] pointer-events-none opacity-5"
          style={{ background: 'var(--color-accent)' }}
        />
        <div className="relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            <Coffee
              size={48}
              className="mx-auto mb-4"
              style={{ color: 'var(--color-text-tertiary)' }}
            />
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
              {t('Rest mode')}
            </h1>
            <p
              className="mt-3 max-w-xs mx-auto text-sm leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t("You chose to rest. Enjoy this time, come back when you're ready.")}
            </p>
            <motion.button
              type="button"
              onClick={handleBackToWork}
              className="mt-8 rounded-2xl px-6 py-3 text-sm font-medium transition-colors"
              style={{
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {t("I'm ready")}
            </motion.button>
          </motion.div>
        </div>
      </div>
    );
  }

  if (displayedNowView === 'thread' && onOpenWorkThread) {
    return (
      <div className="relative h-full overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
        {nowViewTabs}
        <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[minmax(0,1.3fr)_320px]">
          <section
            className="overflow-hidden rounded-[var(--radius-panel)] border p-6"
            style={{
              background: 'color-mix(in srgb, var(--color-surface) 96%, var(--color-bg))',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="mb-4">
              <h1 className="text-2xl font-black tracking-[-0.03em]" style={{ color: 'var(--color-text)' }}>
                {t('now_thread_tab_title')}
              </h1>
              <p className="mt-2 text-sm leading-7" style={{ color: 'var(--color-text-secondary)' }}>
                {t('now_thread_tab_hint')}
              </p>
            </div>
            <div className="space-y-3">
              {threadItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed px-4 py-6 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
                  {t('now_thread_tab_empty')}
                </div>
              ) : (
                threadItems.map((thread) => (
                  <article
                    key={thread.id}
                    className="rounded-2xl border p-4"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                          {thread.title}
                        </div>
                        <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                          {t(`thread_status_${thread.status}`, { ns: 'think' })} · {thread.lane}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenWorkThread(thread.id)}
                        className="rounded-xl px-3 py-2 text-[11px] font-semibold text-white"
                        style={{ background: 'var(--color-accent)' }}
                      >
                        {t('now_resume_thread')}
                      </button>
                    </div>
                    <p className="mt-3 text-sm leading-7" style={{ color: 'var(--color-text-secondary)' }}>
                      {thread.resumeCard.summary || thread.mission || t('thread_resume_summary_empty', { ns: 'think' })}
                    </p>
                    <div className="mt-3 rounded-xl bg-[var(--color-bg)] px-3 py-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      <span className="font-medium" style={{ color: 'var(--color-text)' }}>
                        {t('thread_resume_next_step_label', { ns: 'think' })}
                      </span>{' '}
                      {thread.resumeCard.nextStep || t('thread_resume_next_step_empty', { ns: 'think' })}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <aside
            className="overflow-hidden rounded-[var(--radius-panel)] border"
            style={{
              background: 'color-mix(in srgb, var(--color-surface) 95%, var(--color-bg))',
              borderColor: 'var(--color-border)',
            }}
          >
            <section className="px-4 py-4 sm:px-5 sm:py-5">
              <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('now_thread_sidecar_title')}
              </p>
              <p className="mt-2 text-sm leading-7" style={{ color: 'var(--color-text)' }}>
                {t('now_thread_sidecar_hint')}
              </p>
            </section>
            {currentTask ? (
              <section
                className="border-t px-4 py-4 sm:px-5 sm:py-5"
                style={{ borderColor: 'color-mix(in srgb, var(--color-border) 85%, transparent)' }}
              >
                <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('now_task_fallback_title')}
                </p>
                <p className="mt-2 text-sm leading-7" style={{ color: 'var(--color-text)' }}>
                  {displayTaskTitle(currentTask)}
                </p>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    );
  }

  if (displayedNowView === 'auto' && primaryThreadRecommendation && onOpenWorkThread) {
    const thread = primaryThreadRecommendation.thread;
    const fallbackTask = currentTask;
    return (
      <div className="relative h-full overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
        {nowViewTabs}
        <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[minmax(0,1.3fr)_340px]">
          <section
            className="overflow-hidden rounded-[var(--radius-panel)] border p-6 sm:p-8"
            style={{
              background: 'color-mix(in srgb, var(--color-surface) 96%, var(--color-bg))',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
              >
                {threadSchedulerPolicy === 'semi_auto'
                  ? t('now_thread_mode_semi_auto')
                  : t('now_thread_mode_coach')}
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-[11px]"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
              >
                {t(`thread_status_${thread.status}`, { ns: 'think' })}
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-[11px]"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
              >
                {thread.lane}
              </span>
            </div>

            <h1
              className="mt-5 text-[clamp(1.8rem,3vw,2.8rem)] font-black leading-[1.08] tracking-[-0.035em]"
              style={{ color: 'var(--color-text)' }}
            >
              {thread.title}
            </h1>

            <p className="mt-3 max-w-[56ch] text-[15px] leading-7" style={{ color: 'var(--color-text-secondary)' }}>
              {primaryThreadRecommendation.reason}
            </p>

            {thread.mission ? (
              <p className="mt-4 max-w-[58ch] text-[14px] leading-7" style={{ color: 'var(--color-text-secondary)' }}>
                {thread.mission}
              </p>
            ) : null}

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('thread_resume_summary_label', { ns: 'think' })}
                </p>
                <p className="mt-2 text-sm leading-7" style={{ color: 'var(--color-text)' }}>
                  {thread.resumeCard.summary || t('thread_resume_summary_empty', { ns: 'think' })}
                </p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('thread_resume_next_step_label', { ns: 'think' })}
                </p>
                <p className="mt-2 text-sm leading-7" style={{ color: 'var(--color-text)' }}>
                  {thread.resumeCard.nextStep || t('thread_resume_next_step_empty', { ns: 'think' })}
                </p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('thread_waiting_summary_label', { ns: 'think' })}
                </p>
                <p className="mt-2 text-sm leading-7" style={{ color: 'var(--color-text)' }}>
                  {thread.resumeCard.waitingSummary || t('thread_waiting_summary_empty', { ns: 'think' })}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => onOpenWorkThread(thread.id)}
                className="min-h-11 flex-1 rounded-xl px-5 py-3.5 text-sm font-semibold text-white transition-colors"
                style={{ background: 'var(--color-accent)' }}
              >
                {t('now_resume_thread')}
              </button>
              <button
                type="button"
                onClick={() => onOpenWorkThread()}
                className="min-h-11 rounded-xl border px-4 py-3 text-sm font-medium transition-colors"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                {t('now_open_thread_board')}
              </button>
            </div>
          </section>

          <aside
            className="overflow-hidden rounded-[var(--radius-panel)] border"
            style={{
              background: 'color-mix(in srgb, var(--color-surface) 95%, var(--color-bg))',
              borderColor: 'var(--color-border)',
            }}
          >
            <section className="px-4 py-4 sm:px-5 sm:py-5">
              <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('now_thread_sidecar_title')}
              </p>
              <p className="mt-2 text-sm leading-7" style={{ color: 'var(--color-text)' }}>
                {t('now_thread_sidecar_hint')}
              </p>
            </section>
            {fallbackTask ? (
              <section
                className="border-t px-4 py-4 sm:px-5 sm:py-5"
                style={{ borderColor: 'color-mix(in srgb, var(--color-border) 85%, transparent)' }}
              >
                <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('now_task_fallback_title')}
                </p>
                <p className="mt-2 text-sm leading-7" style={{ color: 'var(--color-text)' }}>
                  {displayTaskTitle(fallbackTask)}
                </p>
              </section>
            ) : null}
            <section
              className="border-t px-4 py-4 sm:px-5 sm:py-5"
              style={{ borderColor: 'color-mix(in srgb, var(--color-border) 85%, transparent)' }}
            >
              <div className="space-y-3">
                {onOpenThinkSession && (
                  <button
                    type="button"
                    onClick={onOpenThinkSession}
                    className="flex w-full items-center justify-between text-left text-sm font-medium"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    <span>{t('Think it through first')}</span>
                    <NotebookPen size={15} />
                  </button>
                )}
                {onNavigateToStream && (
                  <button
                    type="button"
                    onClick={onNavigateToStream}
                    className="flex w-full items-center justify-between text-left text-sm font-medium"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <span>{t('Record an inspiration')}</span>
                    <Wind size={15} />
                  </button>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    );
  }

  if (!currentTask) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center px-6 overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[100px] pointer-events-none opacity-5"
          style={{ background: 'var(--color-success)' }}
        />
        <div className="relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            <PartyPopper
              size={48}
              className="mx-auto mb-4"
              style={{ color: 'var(--color-success)' }}
            />
            <h1 className="text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>
              {t('No tasks yet')}
            </h1>
            <p className="mt-3" style={{ color: 'var(--color-text-secondary)' }}>
              {t('Write something in Stream, or just enjoy this moment')}
            </p>
            {onNavigateToStream && (
              <button
                type="button"
                onClick={onNavigateToStream}
                className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:scale-[1.02] active:scale-95"
                style={{ background: 'var(--color-accent)' }}
              >
                <Wind size={16} />
                {t('Record an inspiration')}
              </button>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  const ddlLabel = currentTask.ddl ? formatDdlLabel(currentTask.ddl) : null;
  const showTimeSuggestion =
    timeAwarenessEnabled && !activeSchedule && timeSlotSuggestion.kind !== 'neutral';
  const recommendationReason = (() => {
    if (!currentTask.ddl) return t('This is your most important thing right now');
    const days = Math.ceil((currentTask.ddl.getTime() - Date.now()) / 86400000);
    if (days <= 0) return t('Already overdue, get on it!');
    if (days <= 2) return t("Most urgent + you've been putting it off");
    return t('Recommended based on urgency and priority');
  })();
  const timeMetaLabel =
    timeAwarenessEnabled && timeContext
      ? `${t(`time_period_${timeContext.period}`)}${
          timeContext.approachingBlockMinutes != null
            ? ` · ${t('time_approaching_block', { minutes: timeContext.approachingBlockMinutes })}`
            : ''
        }`
      : null;
  const ddlTone = currentTask.ddl
    ? isOverdue(currentTask.ddl)
      ? 'var(--color-danger)'
      : daysUntil(currentTask.ddl) <= 2
        ? 'var(--color-warning)'
        : 'var(--color-text-secondary)'
    : 'var(--color-text-secondary)';

  return (
    <div className="relative h-full overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
      {nowViewTabs}
      {lockTick !== null && lockTick > 0 && (
        <div
          className="fixed inset-0 z-[150] flex flex-col items-center justify-center gap-2"
          style={{ background: 'color-mix(in srgb, var(--color-bg) 85%, black)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {tCoach('lock_countdown')}
          </span>
          <span
            className="text-7xl font-black tabular-nums"
            style={{ color: 'var(--color-accent)' }}
          >
            {lockTick}
          </span>
        </div>
      )}

      {showRhythmMirror && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center px-4"
          style={{ background: 'color-mix(in srgb, var(--color-bg) 88%, black)' }}
        >
          <div
            className="max-w-sm rounded-3xl p-6 shadow-xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <p className="text-base font-bold" style={{ color: 'var(--color-text)' }}>
              {tCoach('wip_mirror_title')}
            </p>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {tCoach('wip_mirror_body', {
                count: countTaskSwitchesInWindow(activityEvents, 30 * 60 * 1000),
              })}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-white"
                style={{ background: 'var(--color-accent)' }}
                onClick={() => setShowRhythmMirror(false)}
              >
                {tCoach('wip_mirror_ok')}
              </button>
              <button
                type="button"
                className="w-full rounded-xl py-2 text-xs font-medium"
                style={{ color: 'var(--color-text-tertiary)' }}
                onClick={() => setShowRhythmMirror(false)}
              >
                {tCoach('wip_mirror_now')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-80"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--color-accent-soft) 32%, transparent), transparent)',
        }}
      />
      <div
        className="pointer-events-none absolute right-[-6rem] top-20 h-64 w-64 rounded-full opacity-[0.08] blur-[90px]"
        style={{ background: 'var(--color-accent)' }}
      />

      <div
        className="relative z-10 mx-auto flex w-full max-w-[1180px] flex-col gap-4 lg:gap-5"
        onContextMenu={(e) => {
          if (currentTask) {
            e.preventDefault();
            setTaskCtxMenu({ x: e.clientX, y: e.clientY });
          }
        }}
      >
        <div className="max-w-3xl">
          <OnboardingTip tipId="now-intro">
            <Trans i18nKey="now_intro_tip" ns="now" components={{ strong: <strong /> }} />
          </OnboardingTip>
        </div>

        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.35fr)_minmax(14rem,0.82fr)] lg:grid-cols-[minmax(0,1.42fr)_minmax(17rem,0.88fr)] xl:gap-6">
          <motion.section
            key={currentTask.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="min-w-0 overflow-hidden rounded-[var(--radius-panel)] border"
            style={{
              borderColor: 'var(--color-border)',
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 97%, var(--color-bg)), var(--color-surface))',
            }}
          >
            <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                {timeMetaLabel && (
                  <span style={{ color: 'var(--color-text-tertiary)' }}>{timeMetaLabel}</span>
                )}
                {activeSchedule && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1"
                    style={{
                      background: `${activeSchedule.color}15`,
                      color: activeSchedule.color,
                    }}
                  >
                    <Clock size={12} />
                    {t('Current schedule: {{name}} ({{startTime}}-{{endTime}})', {
                      name: activeSchedule.name,
                      startTime: activeSchedule.startTime,
                      endTime: activeSchedule.endTime,
                    })}
                  </span>
                )}
                {chosenByUserTaskId === currentTask.id && (
                  <span style={{ color: 'var(--color-accent)' }}>{t('Chosen by you')}</span>
                )}
              </div>

              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => selectTask(currentTask.id)}
                  className="max-w-[18ch] text-left text-[clamp(1.7rem,2.5vw,2.55rem)] font-black leading-[1.08] tracking-[-0.035em] transition-colors hover:text-[var(--color-accent)]"
                  style={{ color: 'var(--color-text)' }}
                >
                  {displayTaskTitle(currentTask)}
                </button>

                <p
                  className="max-w-[52ch] text-[15px] leading-7"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {recommendationReason}
                </p>

                {currentTask.description && (
                  <p
                    className="max-w-[58ch] text-[14px] leading-7"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {currentTask.description}
                  </p>
                )}
              </div>

              <div
                className="grid gap-4 border-t pt-4 sm:grid-cols-2"
                style={{ borderColor: 'color-mix(in srgb, var(--color-border) 82%, transparent)' }}
              >
                <div className="space-y-2">
                  <p
                    className="text-[11px] font-semibold"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {t('Current role')}
                  </p>
                  <RolePillMulti
                    roleIds={taskRoleIds(currentTask)}
                    onChangeRoleIds={(ids) =>
                      updateTask({ ...currentTask, ...withTaskRoles(currentTask, ids) })
                    }
                    size="sm"
                  />
                </div>

                <div className="space-y-2">
                  <p
                    className="text-[11px] font-semibold"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {t('Deadline')}
                  </p>
                  {ddlLabel ? (
                    <div
                      className="inline-flex items-center gap-2 text-sm"
                      style={{ color: ddlTone }}
                    >
                      <Clock size={14} />
                      <span>{ddlLabel}</span>
                    </div>
                  ) : (
                    <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                      {t('No deadline')}
                    </span>
                  )}
                </div>
              </div>

              <div
                className="border-t pt-5"
                style={{ borderColor: 'color-mix(in srgb, var(--color-border) 82%, transparent)' }}
              >
                <p
                  className="mb-3 text-[11px] font-semibold"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t('Main actions')}
                </p>

                <AnimatePresence mode="wait">
                  {showIntervention ? (
                    <motion.div
                      key="intervention"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.22 }}
                      className="rounded-[var(--radius-card)] border px-4 py-4"
                      style={{
                        background: 'color-mix(in srgb, var(--color-surface) 92%, var(--color-bg))',
                        borderColor: 'var(--color-border)',
                      }}
                    >
                      <p
                        className="text-sm leading-7"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {t(
                          GENTLE_INTERVENTIONS[
                            Math.floor(rejectionCount / 3) % GENTLE_INTERVENTIONS.length
                          ],
                        )}
                      </p>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={handleDismissIntervention}
                          className="min-h-11 flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-colors"
                          style={{ background: 'var(--color-accent)' }}
                        >
                          {t('Got it, show me the next one')}
                        </button>
                        <button
                          type="button"
                          onClick={handleOffTime}
                          className="min-h-11 rounded-xl border px-4 py-3 text-sm font-medium transition-colors"
                          style={{
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          <span className="flex items-center justify-center gap-1.5">
                            <Coffee size={14} />
                            {t('Not working time')}
                          </span>
                        </button>
                      </div>
                    </motion.div>
                  ) : !showRejectPanel ? (
                    <motion.div
                      key="actions"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={handleStartWorking}
                          className="min-h-11 flex-1 rounded-xl px-5 py-3.5 text-sm font-semibold text-white transition-colors"
                          style={{ background: 'var(--color-accent)' }}
                        >
                          {t('Start working')}
                        </button>
                        {energyLevel !== 'low' && (
                          <button
                            type="button"
                            onClick={handleStartLocked}
                            className="min-h-11 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors sm:min-w-[10rem]"
                            style={{
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            <span className="flex items-center justify-center gap-1.5">
                              <Lock size={14} />
                              {tCoach('Lock in')}
                            </span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <button
                          type="button"
                          onClick={() => setShowRejectPanel(true)}
                          className="text-sm font-medium transition-colors"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {t("Don't want to")}
                        </button>
                        {energyLevel === 'low' && onBrainDump && (
                          <button
                            type="button"
                            onClick={onBrainDump}
                            className="text-sm font-medium transition-colors"
                            style={{ color: 'var(--color-accent)' }}
                          >
                            {tCoach('Brain dump')}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="reject-panel"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.22 }}
                      className="space-y-2 rounded-[var(--radius-card)] border px-4 py-4"
                      style={{
                        background: 'color-mix(in srgb, var(--color-surface) 92%, var(--color-bg))',
                        borderColor: 'var(--color-border)',
                      }}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p
                          className="text-sm font-medium"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {t("Why don't you want to?")}
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowRejectPanel(false)}
                          className="text-xs font-medium transition-colors"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {t('Cancel')}
                        </button>
                      </div>

                      {REJECTION_REASONS.map((reason, i) => (
                        <motion.button
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          key={reason.id}
                          type="button"
                          onClick={() => handleReject(reason.id)}
                          className="block w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors"
                          style={{
                            background: 'transparent',
                            color: 'var(--color-text-secondary)',
                            borderColor: 'var(--color-border)',
                          }}
                        >
                          {t(reason.label)}
                        </motion.button>
                      ))}

                      <motion.button
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: REJECTION_REASONS.length * 0.04 }}
                        type="button"
                        onClick={handleOffTime}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-medium transition-colors"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        <Coffee size={13} />
                        {t('Not working time')}
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.32 }}
            className="min-w-0 overflow-hidden rounded-[var(--radius-panel)] border"
            style={{
              background: 'color-mix(in srgb, var(--color-surface) 95%, var(--color-bg))',
              borderColor: 'var(--color-border)',
            }}
          >
            <section className="px-4 py-4 sm:px-5 sm:py-5">
              <p
                className="text-[11px] font-semibold"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {t('Why this one?')}
              </p>
              <p className="mt-2 text-sm leading-7" style={{ color: 'var(--color-text)' }}>
                {recommendationReason}
              </p>
              {showTimeSuggestion && (
                <p
                  className="mt-3 text-[13px] leading-6"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t(timeSlotSuggestion.messageKey)}
                </p>
              )}
              {activeSchedule && (
                <p
                  className="mt-3 text-[13px] leading-6"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t('Current schedule: {{name}} ({{startTime}}-{{endTime}})', {
                    name: activeSchedule.name,
                    startTime: activeSchedule.startTime,
                    endTime: activeSchedule.endTime,
                  })}
                </p>
              )}
            </section>

            <section
              className="border-t px-4 py-4 sm:px-5 sm:py-5"
              style={{ borderColor: 'color-mix(in srgb, var(--color-border) 85%, transparent)' }}
            >
              <div className="mb-2">
                <p
                  className="text-[11px] font-semibold"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t('What you can do next')}
                </p>
                <p className="mt-1 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('Need a different shape?')}
                </p>
              </div>

              <div
                className="divide-y"
                style={{ borderColor: 'color-mix(in srgb, var(--color-border) 82%, transparent)' }}
              >
                {onOpenThinkSession && (
                  <button
                    type="button"
                    onClick={onOpenThinkSession}
                    className="flex w-full items-center justify-between py-3 text-left text-sm font-medium transition-colors"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    <span>{t('Think it through first')}</span>
                    <NotebookPen size={15} />
                  </button>
                )}

                {onOpenWorkThread && (
                  <button
                    type="button"
                    onClick={() => onOpenWorkThread(threadRecommendation?.thread.id)}
                    className="flex w-full items-center justify-between py-3 text-left text-sm font-medium transition-colors"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    <span>
                      {threadRecommendation ? t('now_continue_thread_entry') : t('Open a thread')}
                    </span>
                    <NotebookPen size={15} />
                  </button>
                )}

                {aiAgentEnabled && currentTask && (
                  <button
                    type="button"
                    onClick={() =>
                      openAiChat(
                        'general',
                        `Context: "Now" recommends the task "${displayTaskTitle(currentTask)}". Help me decide whether to start, defer, or break it down. Be brief and kind.`,
                      )
                    }
                    className="flex w-full items-center justify-between py-3 text-left text-sm font-medium transition-colors"
                    style={{ color: 'var(--color-accent)' }}
                    title={tAi('Now ask AI hint')}
                  >
                    <span>{tAi('Now ask AI')}</span>
                    <Sparkles size={15} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleRandom}
                  className="group flex w-full items-center justify-between py-3 text-left text-sm font-medium transition-colors"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  <span>{t('Try another')}</span>
                  <Dices
                    size={15}
                    className="transition-transform duration-500 group-hover:rotate-180"
                  />
                </button>

                {onNavigateToStream && (
                  <button
                    type="button"
                    onClick={onNavigateToStream}
                    className="group flex w-full items-center justify-between py-3 text-left text-sm font-medium transition-colors"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <span>{t('Record an inspiration')}</span>
                    <Wind size={15} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                )}

                <RecommendationHistory triggerMode="inline" className="mt-1 border-0 px-0 py-3" />
              </div>
            </section>
          </motion.aside>
        </div>

        {taskCtxMenu && currentTask && (
          <TaskContextMenu
            x={taskCtxMenu.x}
            y={taskCtxMenu.y}
            task={currentTask}
            onClose={() => setTaskCtxMenu(null)}
            onOpenDetail={() => selectTask(currentTask.id)}
            onAddSubtask={() => selectTask(currentTask.id)}
            onSetDdl={() => selectTask(currentTask.id)}
            onChangeRole={(roleId) => updateTask({ ...currentTask, roleId })}
            onComplete={() =>
              updateStatus(currentTask.id, 'completed').then(() => {
                const freshTasks = useTaskStore.getState().tasks;
                const freshFiltered = filterByRole(
                  freshTasks,
                  useRoleStore.getState().currentRoleId,
                );
                setCurrentTask(
                  pickNowRecommendation(
                    freshFiltered,
                    freshTasks,
                    useExecCoachStore.getState().energyLevel,
                  ),
                );
              })
            }
            onArchive={() =>
              updateStatus(currentTask.id, 'archived').then(() => {
                const freshTasks = useTaskStore.getState().tasks;
                const freshFiltered = filterByRole(
                  freshTasks,
                  useRoleStore.getState().currentRoleId,
                );
                setCurrentTask(
                  pickNowRecommendation(
                    freshFiltered,
                    freshTasks,
                    useExecCoachStore.getState().energyLevel,
                  ),
                );
              })
            }
            onDelete={() =>
              deleteTask(currentTask.id).then(() => {
                const freshTasks = useTaskStore.getState().tasks;
                const freshFiltered = filterByRole(
                  freshTasks,
                  useRoleStore.getState().currentRoleId,
                );
                setChosenByUserTaskId(null);
                setCurrentTask(
                  pickNowRecommendation(
                    freshFiltered,
                    freshTasks,
                    useExecCoachStore.getState().energyLevel,
                  ),
                );
              })
            }
            onDoItNow={() => useNowOverrideStore.getState().requestDoItNow(currentTask.id)}
            onBoostPriority={() => {
              updateTask({
                ...currentTask,
                priority: Math.min(10, (currentTask.priority ?? 5) + 1),
                status:
                  currentTask.status === 'inbox' || currentTask.status === 'active'
                    ? 'today'
                    : currentTask.status,
              });
            }}
          />
        )}
      </div>
    </div>
  );
}
