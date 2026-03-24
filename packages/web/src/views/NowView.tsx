import type { Task, TaskStatus } from '@my-little-todo/core';
import { daysUntil, isOverdue } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Clock,
  Coffee,
  Dices,
  ExternalLink,
  Info,
  PartyPopper,
  Pause,
  PenLine,
  Play,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { OnboardingTip } from '../components/OnboardingTip';
import { RecommendationHistory } from '../components/RecommendationHistory';
import { RolePill } from '../components/RolePickerPopover';
import { TaskContextMenu } from '../components/TaskContextMenu';
import {
  filterByRole,
  formatDdlLabel,
  isInScheduleBlock,
  pickRandom,
  pickRecommendation,
  useBehaviorStore,
  useRoleStore,
  useScheduleStore,
  useTaskStore,
} from '../stores';

const REJECTION_REASONS = [
  { id: 'no_conditions', label: 'No conditions to do this now' },
  { id: 'too_big', label: "Too big, don't know where to start" },
  { id: 'dont_want', label: "Just don't want to" },
  { id: 'something_urgent', label: 'Something more urgent' },
] as const;

const GENTLE_INTERVENTIONS = [
  "You've rejected several tasks. Maybe now isn't a good time for work? Take a break.",
  "Rejecting is okay — but if you don't want to do any task, maybe try a different environment or approach.",
  "Consecutive rejections might mean you need a break, or the task breakdown isn't right. Want to adjust?",
];

interface FocusState {
  taskId: string;
  startedAt: Date;
  notes: string;
}

function formatElapsed(
  ms: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return t('{{hours}} hours {{minutes}} minutes', { hours, minutes });
  if (minutes > 0) return t('{{minutes}} minutes {{seconds}} seconds', { minutes, seconds });
  return t('{{seconds}} seconds', { seconds });
}

function formatTimeOfDay(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function FocusSubtaskRow({
  subtask,
  onToggle,
}: {
  subtask: Task;
  onToggle: () => void;
}) {
  const done = subtask.status === 'completed';
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-start gap-2.5 rounded-lg px-3 py-2 w-full text-left transition-colors hover:bg-[var(--color-bg)]"
    >
      <div
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors mt-0.5"
        style={{
          borderColor: done ? 'var(--color-success)' : 'var(--color-border)',
          background: done ? 'var(--color-success)' : 'transparent',
        }}
      >
        {done && <Check size={10} className="text-white" />}
      </div>
      <span
        className="text-[13px] leading-relaxed"
        style={{
          color: done ? 'var(--color-text-tertiary)' : 'var(--color-text)',
          textDecoration: done ? 'line-through' : 'none',
        }}
      >
        {subtask.title}
      </span>
    </button>
  );
}

function FocusModeView({
  task,
  focusState,
  onShelve,
  onComplete,
  onOpenDetail,
}: {
  task: Task;
  focusState: FocusState;
  onShelve: () => void;
  onComplete: () => void;
  onOpenDetail: () => void;
}) {
  const { tasks, updateTask, updateStatus } = useTaskStore();
  const { t } = useTranslation('now');
  const [elapsed, setElapsed] = useState(0);
  const [localNotes, setLocalNotes] = useState(focusState.notes);
  const [showNotes, setShowNotes] = useState(false);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - focusState.startedAt.getTime());
    }, 1000);
    return () => clearInterval(interval);
  }, [focusState.startedAt]);

  const handleNotesChange = (val: string) => {
    setLocalNotes(val);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      focusState.notes = val;
    }, 300);
  };

  const resizeTextarea = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 60)}px`;
  };

  useEffect(resizeTextarea, [localNotes]);

  const subtasks = (task.subtaskIds ?? [])
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined);

  const handleToggleSubtask = async (sub: Task) => {
    const newStatus: TaskStatus = sub.status === 'completed' ? 'active' : 'completed';
    await updateStatus(sub.id, newStatus);
  };

  const handleComplete = () => {
    if (localNotes.trim()) {
      const timestamp = formatTimeOfDay(new Date());
      const separator = task.body.trim() ? '\n\n' : '';
      const noteEntry = `${separator}---\n**${timestamp} ${t('Focus notes')}**\n${localNotes.trim()}`;
      updateTask({ ...task, body: task.body + noteEntry });
    }
    onComplete();
  };

  const ddlLabel = task.ddl ? formatDdlLabel(task.ddl) : null;

  return (
    <div className="relative flex h-full flex-col items-center px-6 overflow-y-auto overflow-x-hidden">
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[100px] pointer-events-none opacity-5"
        style={{ background: 'var(--color-success)' }}
      />

      <div className="relative z-10 w-full max-w-md pt-12 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h1
            className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight"
            style={{ color: 'var(--color-text)' }}
          >
            {task.title}
          </h1>
          <div className="mt-3 flex justify-center">
            <RolePill
              roleId={task.roleId}
              onChangeRole={(newRoleId) => updateTask({ ...task, roleId: newRoleId })}
              size="md"
            />
          </div>
        </motion.div>

        {/* Timer info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-8 text-center"
        >
          <div
            className="inline-flex items-center gap-3 rounded-2xl px-5 py-3 shadow-sm"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="flex items-center gap-1.5">
              <Play size={12} style={{ color: 'var(--color-success)' }} />
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('Started at {{time}}', { time: formatTimeOfDay(focusState.startedAt) })}
              </span>
            </div>
            <div className="w-px h-4" style={{ background: 'var(--color-border)' }} />
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: 'var(--color-text)' }}
            >
              {t('{{elapsed}} elapsed', { elapsed: formatElapsed(elapsed, t) })}
            </span>
          </div>
          {ddlLabel && (
            <div className="mt-2 flex items-center justify-center gap-1.5">
              <Clock size={12} style={{ color: 'var(--color-warning)' }} />
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {ddlLabel}
              </span>
            </div>
          )}
        </motion.div>

        {/* Quick notes */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8"
        >
          <button
            type="button"
            onClick={() => setShowNotes(!showNotes)}
            className="flex items-center gap-1.5 text-xs font-medium mb-2"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <PenLine size={12} />
            {showNotes ? t('Collapse notes') : t('Quick notes')}
          </button>
          <AnimatePresence>
            {showNotes && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <textarea
                  ref={textareaRef}
                  value={localNotes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder={t('Jot down thoughts while working...')}
                  className="w-full resize-none rounded-xl px-3 py-2.5 text-[13px] leading-relaxed outline-none"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    minHeight: '60px',
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Subtasks */}
        {subtasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-6"
          >
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
              {t('Subtasks ({{completed}}/{{total}})', {
                completed: subtasks.filter((s) => s.status === 'completed').length,
                total: subtasks.length,
              })}
            </p>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--color-border)' }}
            >
              {subtasks.map((sub) => (
                <FocusSubtaskRow
                  key={sub.id}
                  subtask={sub}
                  onToggle={() => handleToggleSubtask(sub)}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-10 flex items-center gap-3"
        >
          <button
            type="button"
            onClick={onShelve}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium transition-all hover:scale-[1.01] active:scale-[0.98]"
            style={{
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <Pause size={16} />
            {t('Shelve')}
          </button>
          <button
            type="button"
            onClick={handleComplete}
            className="group relative flex-[2] overflow-hidden rounded-2xl px-6 py-3.5 text-white font-semibold text-sm shadow-lg transition-all hover:scale-[1.02] active:scale-95"
            style={{ background: 'var(--color-success)' }}
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full transition-transform group-hover:translate-y-0 ease-out duration-300" />
            <span className="relative flex items-center justify-center gap-2">
              <Check size={16} />
              {t('Complete')}
            </span>
          </button>
        </motion.div>

        {/* Detail link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-6 text-center"
        >
          <button
            type="button"
            onClick={onOpenDetail}
            className="flex items-center gap-1.5 text-xs font-medium mx-auto transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <ExternalLink size={12} />
            {t('View / Edit task details')}
          </button>
        </motion.div>
      </div>
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: NowView has many states
export function NowView() {
  const { t } = useTranslation('now');
  const [showRejectPanel, setShowRejectPanel] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [rejectionCount, setRejectionCount] = useState(0);
  const [showIntervention, setShowIntervention] = useState(false);
  const [isOffTime, setIsOffTime] = useState(false);
  const [focusState, setFocusState] = useState<FocusState | null>(null);
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);
  const [taskCtxMenu, setTaskCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const { tasks, loading, load, selectTask, updateTask, updateStatus } = useTaskStore();
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const filtered = useMemo(() => filterByRole(tasks, currentRoleId), [tasks, currentRoleId]);
  const { recordEvent, load: loadBehavior } = useBehaviorStore();
  const scheduleBlocks = useScheduleStore((s) => s.blocks);
  const loadSchedules = useScheduleStore((s) => s.load);
  const activeSchedule = useMemo(() => isInScheduleBlock(scheduleBlocks), [scheduleBlocks]);

  useEffect(() => {
    load();
    loadBehavior();
    loadSchedules();
  }, [load, loadBehavior, loadSchedules]);

  useEffect(() => {
    if (filtered.length > 0 && !currentTask && !focusState) {
      setCurrentTask(pickRecommendation(filtered));
    }
  }, [filtered, currentTask, focusState]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset state when role filter changes
  useEffect(() => {
    if (!focusState) {
      setCurrentTask(pickRecommendation(filtered));
      setRejectionCount(0);
      setShowRejectPanel(false);
      setShowIntervention(false);
    }
  }, [currentRoleId]);

  const handleReject = (reasonId: string) => {
    setShowRejectPanel(false);
    if (currentTask) {
      const reason = REJECTION_REASONS.find((r) => r.id === reasonId);
      recordEvent({
        taskId: currentTask.id,
        taskTitle: currentTask.title,
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
    const next = pickRecommendation(remaining);
    setCurrentTask(next);
  };

  const handleDismissIntervention = () => {
    setShowIntervention(false);
    const remaining = filtered.filter((t) => t.id !== currentTask?.id);
    const next = pickRecommendation(remaining);
    setCurrentTask(next);
  };

  const handleOffTime = () => {
    setIsOffTime(true);
    setShowIntervention(false);
    setShowRejectPanel(false);
  };

  const handleBackToWork = () => {
    setIsOffTime(false);
    setRejectionCount(0);
    setCurrentTask(pickRecommendation(filtered));
  };

  const handleRandom = () => {
    if (currentTask) {
      recordEvent({
        taskId: currentTask.id,
        taskTitle: currentTask.title,
        action: 'swapped',
      });
    }
    const next = pickRandom(filtered);
    setCurrentTask(next);
  };

  const handleStartWorking = () => {
    if (!currentTask) return;
    recordEvent({
      taskId: currentTask.id,
      taskTitle: currentTask.title,
      action: 'accepted',
    });
    setFocusState({
      taskId: currentTask.id,
      startedAt: new Date(),
      notes: '',
    });
  };

  const handleShelve = () => {
    setFocusState(null);
    const remaining = filtered.filter((t) => t.id !== focusState?.taskId);
    const next = pickRecommendation(remaining);
    setCurrentTask(next);
  };

  const handleFocusComplete = useCallback(async () => {
    if (!focusState) return;
    await updateStatus(focusState.taskId, 'completed');
    setFocusState(null);
    setShowCompletionCelebration(true);
    setTimeout(() => {
      setShowCompletionCelebration(false);
      const freshTasks = useTaskStore.getState().tasks;
      const freshFiltered = filterByRole(freshTasks, useRoleStore.getState().currentRoleId);
      setCurrentTask(pickRecommendation(freshFiltered));
    }, 2500);
  }, [focusState, updateStatus]);

  const handleOpenDetail = () => {
    if (focusState) {
      selectTask(focusState.taskId);
    }
  };

  if (loading && tasks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Loading...')}
        </span>
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
            {t('Well done')}
          </p>
        </motion.div>
      </div>
    );
  }

  // Focus mode
  if (focusState) {
    const focusTask = tasks.find((t) => t.id === focusState.taskId);
    if (focusTask) {
      return (
        <FocusModeView
          task={focusTask}
          focusState={focusState}
          onShelve={handleShelve}
          onComplete={handleFocusComplete}
          onOpenDetail={handleOpenDetail}
        />
      );
    }
    setFocusState(null);
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
          </motion.div>
        </div>
      </div>
    );
  }

  const ddlLabel = currentTask.ddl ? formatDdlLabel(currentTask.ddl) : null;

  const explainWhy = (): string => {
    if (!currentTask.ddl) return t('This is your most important thing right now');
    const days = Math.ceil((currentTask.ddl.getTime() - Date.now()) / 86400000);
    if (days <= 0) return t('Already overdue, get on it!');
    if (days <= 2) return t("Most urgent + you've been putting it off");
    return t('Recommended based on urgency and priority');
  };

  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6 overflow-hidden">
      <RecommendationHistory />

      {/* Onboarding tip */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4">
        <OnboardingTip tipId="now-intro">
          <Trans i18nKey="now_intro_tip" ns="now" components={{ strong: <strong /> }} />
        </OnboardingTip>
      </div>

      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[100px] pointer-events-none opacity-5"
        style={{ background: 'var(--color-accent)' }}
      />

      <div
        className="relative z-10 w-full max-w-md text-center"
        onContextMenu={(e) => {
          if (currentTask) {
            e.preventDefault();
            setTaskCtxMenu({ x: e.clientX, y: e.clientY });
          }
        }}
      >
        {activeSchedule && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-medium"
            style={{
              background: `${activeSchedule.color}15`,
              border: `1px solid ${activeSchedule.color}30`,
              color: activeSchedule.color,
            }}
          >
            <Clock size={12} />
            {t('Current schedule: {{name}} ({{startTime}}-{{endTime}})', {
              name: activeSchedule.name,
              startTime: activeSchedule.startTime,
              endTime: activeSchedule.endTime,
            })}
          </motion.div>
        )}
        <motion.div
          key={currentTask.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <button
            type="button"
            onClick={() => selectTask(currentTask.id)}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight transition-colors hover:text-[var(--color-accent)]"
            style={{ color: 'var(--color-text)' }}
          >
            {currentTask.title}
          </button>
          <div className="mt-3 flex justify-center">
            <RolePill
              roleId={currentTask.roleId}
              onChangeRole={(newRoleId) => {
                updateTask({ ...currentTask, roleId: newRoleId });
              }}
              size="md"
            />
          </div>
          {currentTask.description && (
            <p
              className="mt-3 text-lg font-medium"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {currentTask.description}
            </p>
          )}
        </motion.div>

        {ddlLabel && currentTask.ddl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-8 inline-flex items-center gap-2 rounded-full px-4 py-2 shadow-sm"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <Clock
              size={16}
              style={{
                color: isOverdue(currentTask.ddl)
                  ? 'var(--color-danger)'
                  : daysUntil(currentTask.ddl) <= 2
                    ? 'var(--color-warning)'
                    : 'var(--color-text-tertiary)',
              }}
            />
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {ddlLabel}
            </span>
          </motion.div>
        )}

        <div className="mt-12 min-h-[160px]">
          <AnimatePresence mode="wait">
            {showIntervention ? (
              <motion.div
                key="intervention"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="rounded-2xl p-5 text-center shadow-sm"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <p
                  className="text-sm leading-relaxed mb-5"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t(
                    GENTLE_INTERVENTIONS[
                      Math.floor(rejectionCount / 3) % GENTLE_INTERVENTIONS.length
                    ],
                  )}
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleDismissIntervention}
                    className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-95"
                    style={{ background: 'var(--color-accent)', color: 'white' }}
                  >
                    {t('Got it, show me the next one')}
                  </button>
                  <button
                    type="button"
                    onClick={handleOffTime}
                    className="w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
                    style={{ color: 'var(--color-text-tertiary)' }}
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
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, filter: 'blur(4px)' }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center gap-4"
              >
                <button
                  type="button"
                  onClick={handleStartWorking}
                  className="group relative w-full max-w-[240px] overflow-hidden rounded-2xl px-8 py-4 text-white font-semibold text-lg shadow-lg transition-all hover:scale-[1.02] active:scale-95"
                  style={{ background: 'var(--color-accent)' }}
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full transition-transform group-hover:translate-y-0 ease-out duration-300" />
                  <span className="relative">{t('Start working')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRejectPanel(true)}
                  className="rounded-xl px-6 py-2 text-sm font-medium transition-colors"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t("Don't want to")}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="reject-panel"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="flex flex-col gap-2 rounded-2xl p-4 shadow-sm"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div className="flex items-center justify-between mb-4 px-2">
                  <p
                    className="text-sm font-medium"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t("Why don't you want to?")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowRejectPanel(false)}
                    className="text-xs transition-colors"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {t('Cancel')}
                  </button>
                </div>
                {REJECTION_REASONS.map((reason, i) => (
                  <motion.button
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={reason.id}
                    type="button"
                    onClick={() => handleReject(reason.id)}
                    className="block w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-all active:scale-[0.98]"
                    style={{
                      background: 'var(--color-bg)',
                      color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {t(reason.label)}
                  </motion.button>
                ))}
                <motion.button
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: REJECTION_REASONS.length * 0.05 }}
                  type="button"
                  onClick={handleOffTime}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-medium transition-all"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <Coffee size={13} />
                  {t('Not working time')}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 flex flex-col items-center gap-4"
        >
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowReason(!showReason)}
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <Info size={14} />
              <span>{t('Why this one?')}</span>
            </button>
            <AnimatePresence>
              {showReason && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                  className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 w-max max-w-[200px] rounded-lg px-3 py-2 text-xs shadow-md"
                  style={{
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {explainWhy()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={handleRandom}
            className="group flex items-center gap-2 text-xs font-medium transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <Dices size={16} className="transition-transform duration-500 group-hover:rotate-180" />
            <span>{t('Try another')}</span>
          </button>
        </motion.div>

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
                setCurrentTask(pickRecommendation(freshFiltered));
              })
            }
            onArchive={() =>
              updateStatus(currentTask.id, 'archived').then(() => {
                const freshTasks = useTaskStore.getState().tasks;
                const freshFiltered = filterByRole(
                  freshTasks,
                  useRoleStore.getState().currentRoleId,
                );
                setCurrentTask(pickRecommendation(freshFiltered));
              })
            }
            onDelete={() =>
              updateStatus(currentTask.id, 'archived').then(() => {
                const freshTasks = useTaskStore.getState().tasks;
                const freshFiltered = filterByRole(
                  freshTasks,
                  useRoleStore.getState().currentRoleId,
                );
                setCurrentTask(pickRecommendation(freshFiltered));
              })
            }
          />
        )}
      </div>
    </div>
  );
}
