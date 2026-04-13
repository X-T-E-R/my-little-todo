import type { Task, TaskStatus } from '@my-little-todo/core';
import { displayTaskTitle, taskRoleIds, withTaskRoles } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, ExternalLink, Eye, Lock, Pause, PenLine, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type FocusSessionState,
  useExecCoachStore,
  useFocusSessionStore,
  useTaskStore,
} from '../stores';
import { formatDdlLabel } from '../stores/taskStore';
import { RolePillMulti } from './RolePickerPopover';

const QUICK_EXIT_KEYS = [
  'lock_exit_quick_rest',
  'lock_exit_quick_urgent',
  'lock_exit_quick_mood',
  'lock_exit_quick_split',
  'lock_exit_quick_interrupt',
  'lock_exit_quick_unsure',
] as const;

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
        {displayTaskTitle(subtask)}
      </span>
    </button>
  );
}

/**
 * Full-screen focus UI when a session exists and user is not in peek mode.
 * Rendered from App so tab switches do not unmount focus while locked.
 */
export function FocusModeOverlay() {
  const session = useFocusSessionStore((s) => s.session);
  const setSession = useFocusSessionStore((s) => s.setSession);
  const { tasks, updateStatus, selectTask } = useTaskStore();
  const bumpCompletionCount = useExecCoachStore((s) => s.bumpCompletionCount);
  const energyLevel = useExecCoachStore((s) => s.energyLevel);

  const task = session ? tasks.find((x) => x.id === session.taskId) : undefined;

  useEffect(() => {
    if (session && !tasks.some((x) => x.id === session.taskId)) {
      setSession(null);
    }
  }, [session, tasks, setSession]);

  const handleShelve = () => {
    const shelvedId = session?.taskId;
    setSession(null);
    window.dispatchEvent(
      new CustomEvent('mlt-focus-shelved', { detail: { taskId: shelvedId ?? null } }),
    );
  };

  const shelveWithReason = (reasonLine: string) => {
    const shelvedId = session?.taskId;
    setSession(null);
    window.dispatchEvent(
      new CustomEvent('mlt-focus-shelved', {
        detail: { taskId: shelvedId ?? null, exitReason: reasonLine },
      }),
    );
  };

  const handleFocusComplete = async () => {
    if (!session) return;
    await updateStatus(session.taskId, 'completed');
    bumpCompletionCount();
    setSession(null);
    window.dispatchEvent(new CustomEvent('mlt-focus-completed'));
  };

  const handleOpenDetail = () => {
    if (session) selectTask(session.taskId);
  };

  if (!session || session.peeking || !task) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-[var(--color-bg)]"
      style={{ paddingTop: 'var(--safe-area-top)' }}
    >
      <FocusModeView
        task={task}
        session={session}
        locked={!!session.locked}
        lowEnergy={energyLevel === 'low'}
        onShelve={handleShelve}
        onShelveWithReason={shelveWithReason}
        onComplete={handleFocusComplete}
        onOpenDetail={handleOpenDetail}
      />
    </div>
  );
}

function FocusModeView({
  task,
  session,
  locked,
  lowEnergy,
  onShelve,
  onShelveWithReason,
  onComplete,
  onOpenDetail,
}: {
  task: Task;
  session: FocusSessionState;
  locked: boolean;
  lowEnergy: boolean;
  onShelve: () => void;
  onShelveWithReason: (reason: string) => void;
  onComplete: () => void;
  onOpenDetail: () => void;
}) {
  const { tasks, updateTask, updateStatus } = useTaskStore();
  const updateFocusSession = useFocusSessionStore((s) => s.updateSession);
  const { t } = useTranslation('now');
  const { t: tc } = useTranslation('coach');
  const [elapsed, setElapsed] = useState(0);
  const [localNotes, setLocalNotes] = useState(session.notes);
  const [showNotes, setShowNotes] = useState(false);
  const [exitStep, setExitStep] = useState<'idle' | 'reason'>('idle');
  const [exitReason, setExitReason] = useState('');
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - session.startedAt.getTime());
    }, 1000);
    return () => clearInterval(interval);
  }, [session.startedAt]);

  useEffect(() => {
    setLocalNotes(session.notes);
  }, [session.notes]);

  const handleNotesChange = (val: string) => {
    setLocalNotes(val);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      updateFocusSession({ notes: val });
    }, 300);
  };

  const resizeTextarea = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 60)}px`;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: textarea height follows content
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

  const finishLockedExit = (reasonLine: string) => {
    setExitStep('idle');
    setExitReason('');
    onShelveWithReason(reasonLine.trim() || '(locked exit)');
  };

  const handleShelveClick = () => {
    if (!locked) {
      onShelve();
      return;
    }
    setExitStep('reason');
  };

  const handleQuickExit = (key: (typeof QUICK_EXIT_KEYS)[number]) => {
    const label = tc(key);
    const extra = exitReason.trim();
    finishLockedExit(extra ? `${label} — ${extra}` : label);
  };

  const handleFreeTextExit = () => {
    const text = exitReason.trim();
    if (!text) return;
    finishLockedExit(text);
  };

  const ddlLabel = task.ddl ? formatDdlLabel(task.ddl) : null;
  const minutes = Math.floor(elapsed / 60000);

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
            className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight"
            style={{ color: 'var(--color-text)' }}
          >
            {displayTaskTitle(task)}
          </h1>
          <div className="mt-3 flex justify-center">
            <RolePillMulti
              roleIds={taskRoleIds(task)}
              onChangeRoleIds={(ids) => updateTask({ ...task, ...withTaskRoles(task, ids) })}
              size="md"
            />
          </div>
        </motion.div>

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
                {t('Started at {{time}}', { time: formatTimeOfDay(session.startedAt) })}
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
          {ddlLabel && !lowEnergy && (
            <div className="mt-2 flex items-center justify-center gap-1.5">
              <Clock size={12} style={{ color: 'var(--color-warning)' }} />
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {ddlLabel}
              </span>
            </div>
          )}
        </motion.div>

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

        {locked && (
          <p
            className="mt-4 text-center text-[11px] font-medium"
            style={{ color: 'var(--color-accent)' }}
          >
            <Lock size={12} className="inline mr-1" />
            {tc('Locked focus')}
          </p>
        )}

        {locked && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => updateFocusSession({ peeking: true })}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-opacity hover:opacity-90"
              style={{
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
                background: 'var(--color-surface)',
              }}
            >
              <Eye size={14} />
              {tc('peek_mode')}
            </button>
          </div>
        )}

        {exitStep === 'reason' && locked && (
          <div
            className="mt-6 rounded-2xl p-4 space-y-3"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {tc('lock_exit_title')}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {lowEnergy
                ? tc('lock_exit_encourage_low')
                : tc('lock_exit_encourage', { minutes: Math.max(1, minutes) })}
            </p>
            <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              {tc('lock_exit_pick_reason')}
            </p>
            <div className="flex flex-col gap-2">
              {QUICK_EXIT_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleQuickExit(key)}
                  className="rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-colors hover:bg-[var(--color-bg)]"
                  style={{
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                >
                  {tc(key)}
                </button>
              ))}
            </div>
            <div className="pt-1">
              <p className="text-[11px] mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
                {tc('lock_exit_optional_note')}
              </p>
              <textarea
                value={exitReason}
                onChange={(e) => setExitReason(e.target.value)}
                placeholder={tc('lock_exit_reason_optional')}
                rows={2}
                className="w-full rounded-xl px-3 py-2 text-[13px] outline-none"
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleFreeTextExit}
              disabled={!exitReason.trim()}
              className="w-full rounded-xl py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--color-warning)' }}
            >
              {tc('lock_exit_with_note')}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setExitStep('idle');
                  setExitReason('');
                }}
                className="flex-1 rounded-xl py-2 text-xs font-medium"
                style={{
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {t('Cancel')}
              </button>
            </div>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-10 flex items-center gap-3"
        >
          <button
            type="button"
            onClick={handleShelveClick}
            disabled={exitStep !== 'idle'}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50"
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

        {!locked && (
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
        )}
      </div>
    </div>
  );
}
