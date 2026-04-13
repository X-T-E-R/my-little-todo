import type { Task } from '@my-little-todo/core';
import {
  daysUntil,
  displayTaskTitle,
  isOverdue,
  taskRoleIds,
  withTaskRoles,
} from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  ListPlus,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarView } from '../components/CalendarView';
import { DndReparentProvider, DndTaskWrapper } from '../components/DndReparentContext';
import { KanbanBoard } from '../components/KanbanBoard';
import { ParentTaskPicker } from '../components/ParentTaskPicker';
import { RolePillMulti } from '../components/RolePickerPopover';
import { TaskContextMenu } from '../components/TaskContextMenu';
import { useModuleStore } from '../modules';
import {
  filterByRole,
  formatDdlLabel,
  getCompletedTasks,
  getTasksWithDdl,
  getTasksWithoutDdl,
  useNowOverrideStore,
  useRoleStore,
  useTaskStore,
  useTimeAwarenessStore,
} from '../stores';

const CONFETTI_COLORS = ['#6b8cce', '#5eb376', '#e8a05c', '#d96c6c', '#9b7ed8', '#f0c040'];

function ConfettiOverlay({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('board');
  const particles = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 400,
        y: -(Math.random() * 300 + 100),
        rotate: Math.random() * 720 - 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: Math.random() * 8 + 4,
        delay: Math.random() * 0.3,
      })),
    [],
  );

  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="pointer-events-none fixed inset-0 z-100 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: '50vw', y: '40vh', opacity: 1, rotate: 0, scale: 1 }}
          animate={{
            x: `calc(50vw + ${p.x}px)`,
            y: `calc(40vh + ${p.y}px)`,
            opacity: 0,
            rotate: p.rotate,
            scale: 0,
          }}
          transition={{ duration: 1.5, delay: p.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: p.size > 8 ? '2px' : '50%',
            background: p.color,
          }}
        />
      ))}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        className="absolute left-1/2 top-[38%] -translate-x-1/2 text-center"
      >
        <p className="text-3xl font-extrabold" style={{ color: 'var(--color-success)' }}>
          {t('Completed!')}
        </p>
      </motion.div>
    </div>
  );
}

function PostponeDialog({
  task,
  onSubmit,
  onCancel,
}: {
  task: Task;
  onSubmit: (reason: string, newDate: Date) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('board');
  const [reason, setReason] = useState('');
  const [dateStr, setDateStr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!reason.trim() || !dateStr) return;
    onSubmit(reason.trim(), new Date(dateStr));
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={t('Close dialog')}
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-x-4 top-[20%] z-50 mx-auto max-w-lg rounded-2xl p-5 shadow-2xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
            {t('Request postponement')}
          </p>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('Close')}
            className="rounded-lg p-1"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Task: {{title}}', { title: displayTaskTitle(task) })}
        </p>

        {task.postponements.length > 0 && (
          <div
            className="mb-4 rounded-xl p-3"
            style={{
              background: 'var(--color-warning-soft)',
              border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
            }}
          >
            <p
              className="text-[11px] font-semibold mb-1.5"
              style={{ color: 'var(--color-warning)' }}
            >
              {t('Postponement history ({{count}} times)', { count: task.postponements.length })}
            </p>
            {task.postponements.map((p, i) => (
              <p
                key={`p-${p.timestamp.getTime()}-${i}`}
                className="text-[11px] leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {p.fromDate.getMonth() + 1}/{p.fromDate.getDate()} → {p.toDate.getMonth() + 1}/
                {p.toDate.getDate()}
                {' · '}
                {p.reason}
              </p>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label
              htmlFor="postpone-reason"
              className="text-xs font-medium mb-1 block"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {t('Reason for postponement')}
            </label>
            <input
              id="postpone-reason"
              ref={inputRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              placeholder={t('Why do you need to postpone?')}
              className="w-full rounded-xl px-3 py-2.5 text-[14px] outline-none"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </div>
          <div>
            <label
              htmlFor="postpone-date"
              className="text-xs font-medium mb-1 block"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {t('New deadline')}
            </label>
            <input
              id="postpone-date"
              type="datetime-local"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-[14px] outline-none"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!reason.trim() || !dateStr}
            className="rounded-lg px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--color-warning)' }}
          >
            {t('Confirm postponement')}
          </button>
        </div>
      </motion.div>
    </>
  );
}

function SubmitDialog({
  task,
  onSubmit,
  onCancel,
}: {
  task: Task;
  onSubmit: (note: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('board');
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={t('Close dialog')}
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-x-4 top-[25%] z-50 mx-auto max-w-lg rounded-2xl p-5 shadow-2xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
            {t('Submit result')}
          </p>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('Close')}
            className="rounded-lg p-1"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Task: {{title}}', { title: displayTaskTitle(task) })}
        </p>
        {task.ddl && (
          <p
            className="text-xs mb-3"
            style={{ color: isOverdue(task.ddl) ? 'var(--color-danger)' : 'var(--color-success)' }}
          >
            {isOverdue(task.ddl)
              ? t('Overdue — but finishing is still great')
              : t('Completed on time!')}
          </p>
        )}

        <input
          ref={inputRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit(note.trim() || t('Done'));
          }}
          placeholder={t('Write a completion note (optional)')}
          className="w-full rounded-xl px-3 py-2.5 text-[14px] outline-none"
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={() => onSubmit(note.trim() || t('Done'))}
            className="flex items-center gap-1 rounded-lg px-4 py-1.5 text-xs font-semibold text-white"
            style={{ background: 'var(--color-success)' }}
          >
            <Check size={12} />
            {t('Confirm completion')}
          </button>
        </div>
      </motion.div>
    </>
  );
}

interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
  color: string;
}

type ContextMenuTriggerEvent = Pick<React.MouseEvent, 'preventDefault' | 'clientX' | 'clientY'>;

function createContextMenuTriggerEvent(rect: DOMRect): ContextMenuTriggerEvent {
  return {
    preventDefault() {},
    clientX: rect.right,
    clientY: rect.bottom,
  };
}

function groupByTimeHorizon(tasks: Task[], now: Date): TaskGroup[] {
  const overdue: Task[] = [];
  const today: Task[] = [];
  const thisWeek: Task[] = [];
  const later: Task[] = [];

  for (const t of tasks) {
    if (!t.ddl) continue;
    const days = daysUntil(t.ddl, now);
    if (days <= 0) overdue.push(t);
    else if (days <= 1) today.push(t);
    else if (days <= 7) thisWeek.push(t);
    else later.push(t);
  }

  const groups: TaskGroup[] = [];
  if (overdue.length > 0)
    groups.push({ key: 'overdue', label: 'Overdue', tasks: overdue, color: 'var(--color-danger)' });
  if (today.length > 0)
    groups.push({ key: 'today', label: 'Due today', tasks: today, color: 'var(--color-warning)' });
  if (thisWeek.length > 0)
    groups.push({
      key: 'week',
      label: 'Due this week',
      tasks: thisWeek,
      color: 'var(--color-accent)',
    });
  if (later.length > 0)
    groups.push({
      key: 'later',
      label: 'Later',
      tasks: later,
      color: 'var(--color-text-tertiary)',
    });
  return groups;
}

function BoardSubtaskPreview({ task }: { task: Task }) {
  const { t } = useTranslation('board');
  const allTasks = useTaskStore((s) => s.tasks);
  const ids = task.subtaskIds ?? [];
  if (ids.length === 0) return null;

  const subtasks = ids
    .map((id) => allTasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined);

  const visible = subtasks.slice(0, 3);
  const remaining = subtasks.length - visible.length;

  return (
    <div className="mt-2.5 space-y-1">
      {visible.map((sub) => {
        const done = sub.status === 'completed';
        return (
          <div key={sub.id} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="flex h-3 w-3 shrink-0 items-center justify-center rounded border"
              style={{
                borderColor: done ? 'var(--color-success)' : 'var(--color-border)',
                background: done ? 'var(--color-success)' : 'transparent',
              }}
            >
              {done && <Check size={7} className="text-white" />}
            </span>
            <span
              className="truncate"
              style={{
                color: done ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                textDecoration: done ? 'line-through' : 'none',
              }}
            >
              {displayTaskTitle(sub)}
            </span>
            {sub.ddl && !done && (
              <span
                className="ml-auto shrink-0 text-[9px] rounded-full px-1.5 py-0.5"
                style={{
                  background: isOverdue(sub.ddl)
                    ? 'var(--color-danger-soft)'
                    : 'var(--color-warning-soft, rgba(234,179,8,0.1))',
                  color: isOverdue(sub.ddl)
                    ? 'var(--color-danger)'
                    : 'var(--color-warning, #ca8a04)',
                }}
              >
                {sub.ddl.getMonth() + 1}/{sub.ddl.getDate()}
              </span>
            )}
          </div>
        );
      })}
      {remaining > 0 && (
        <span className="text-[10px] ml-4" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('{{remaining}} more subtasks...', { remaining })}
        </span>
      )}
    </div>
  );
}

function TaskCard({
  task,
  index,
  now,
  onComplete,
  onPostpone,
  onClick,
  onContextMenu,
}: {
  task: Task;
  index: number;
  now: Date;
  onComplete: (task: Task) => void;
  onPostpone: (task: Task) => void;
  onClick: (task: Task) => void;
  onContextMenu: (e: ContextMenuTriggerEvent, task: Task) => void;
}) {
  const { t } = useTranslation('board');
  const days = task.ddl ? daysUntil(task.ddl, now) : null;
  const urgent = days !== null && days <= 2;
  const taskOverdue = task.ddl ? isOverdue(task.ddl, now) : false;
  const stressed = urgent || taskOverdue;
  const allTasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);

  const ids = task.subtaskIds ?? [];
  const subtasks = ids.map((id) => allTasks.find((t) => t.id === id)).filter((t): t is Task => !!t);
  const completedSubtasks = subtasks.filter((s) => s.status === 'completed').length;
  const totalSubtasks = ids.length;

  const urgentSubtasks = subtasks.filter(
    (s) => s.ddl && s.status !== 'completed' && daysUntil(s.ddl, now) <= 3,
  );
  const overdueSubtasks = urgentSubtasks.filter((s) => s.ddl && isOverdue(s.ddl, now));
  const firstUrgentSubtask = urgentSubtasks[0];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="group relative overflow-hidden rounded-2xl p-5 shadow-sm transition-all hover:shadow-md cursor-pointer"
      onClick={() => onClick(task)}
      onContextMenu={(e) => onContextMenu(e, task)}
      style={{
        background: stressed
          ? 'linear-gradient(to right, color-mix(in srgb, var(--color-danger-soft) 50%, transparent), var(--color-surface))'
          : 'var(--color-surface)',
        border: stressed
          ? '1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)'
          : '1px solid var(--color-border)',
      }}
    >
      {stressed && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5"
          style={{ background: 'var(--color-danger)' }}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3
            className="text-lg font-semibold leading-tight"
            style={{ color: 'var(--color-text)' }}
          >
            {displayTaskTitle(task)}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RolePillMulti
              roleIds={taskRoleIds(task)}
              onChangeRoleIds={(ids) => {
                updateTask({ ...task, ...withTaskRoles(task, ids) });
              }}
            />
            {task.ddl && (
              <div
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color: stressed ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}
              >
                {stressed ? <AlertCircle size={14} /> : <Calendar size={14} />}
                <span>{formatDdlLabel(task.ddl)}</span>
              </div>
            )}
            {task.postponements.length > 0 && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning)' }}
              >
                {t('Postponed {{count}} times', { count: task.postponements.length })}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onContextMenu(createContextMenuTriggerEvent(rect), task);
          }}
          className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg)] sm:opacity-0 sm:group-hover:opacity-100"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {totalSubtasks > 0 && (
        <div className="mt-4">
          <div
            className="flex justify-between text-xs mb-1.5 font-medium"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <span>{t('Subtasks')}</span>
            <span>
              {completedSubtasks}/{totalSubtasks}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid color-mix(in srgb, var(--color-border) 50%, transparent)',
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0}%`,
              }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{
                background: stressed
                  ? 'linear-gradient(to right, var(--color-danger), var(--color-warning))'
                  : 'linear-gradient(to right, var(--color-accent), var(--color-accent-hover))',
              }}
            />
          </div>
          {urgentSubtasks.length > 0 && (
            <div
              className="mt-2 flex items-center gap-1.5 text-[11px]"
              style={{
                color: overdueSubtasks.length > 0 ? 'var(--color-danger)' : 'var(--color-warning)',
              }}
            >
              <AlertCircle size={11} />
              <span>
                {urgentSubtasks.length === 1
                  ? overdueSubtasks.length > 0
                    ? t('Subtask "{{title}}" is overdue', {
                        title: displayTaskTitle(firstUrgentSubtask ?? task).slice(0, 15),
                      })
                    : t('Subtask "{{title}}" is due soon', {
                        title: displayTaskTitle(firstUrgentSubtask ?? task).slice(0, 15),
                      })
                  : overdueSubtasks.length > 0
                    ? t('{{count}} subtasks ({{overdueCount}} overdue)', {
                        count: urgentSubtasks.length,
                        overdueCount: overdueSubtasks.length,
                      })
                    : t('{{count}} subtasks due soon', { count: urgentSubtasks.length })}
              </span>
            </div>
          )}

          <BoardSubtaskPreview task={task} />
        </div>
      )}

      {task.ddl && (
        <div
          className="mt-4 flex gap-3"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onComplete(task)}
            className="group relative flex-1 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold shadow-md transition-all hover:scale-[1.02] active:scale-95"
            style={{ background: 'var(--color-text)', color: 'var(--color-surface)' }}
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full transition-transform group-hover:translate-y-0 ease-out duration-300" />
            <span className="relative flex items-center justify-center gap-2">
              <Check size={16} />
              {t('Submit result')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onPostpone(task)}
            className="rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {t('Request postponement')}
          </button>
        </div>
      )}
    </motion.div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: main view with many features
export function BoardView() {
  const { t } = useTranslation('board');
  const {
    tasks,
    loading,
    load,
    postponeTask,
    submitTask,
    selectTask,
    updateTask,
    deleteTask,
    addSubtask,
    updateStatus,
    reparentTask,
    error: taskError,
  } = useTaskStore();
  const scheduleBlocks = useTimeAwarenessStore((s) => s.blocks);
  const loadTimeAwareness = useTimeAwarenessStore((s) => s.load);
  const timeAwarenessEnabled = useModuleStore((s) => s.isEnabled('time-awareness'));
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const filtered = useMemo(() => filterByRole(tasks, currentRoleId), [tasks, currentRoleId]);
  const [postponingTask, setPostponingTask] = useState<Task | null>(null);
  const [parentPickerTargetId, setParentPickerTargetId] = useState<string | null>(null);
  const [submittingTask, setSubmittingTask] = useState<Task | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showNoDdl, setShowNoDdl] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'kanban'>('kanban');
  const [kanbanFullscreen, setKanbanFullscreen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    task: Task;
  } | null>(null);
  const [subtaskInputId, setSubtaskInputId] = useState<string | null>(null);
  const [ddlInputId, setDdlInputId] = useState<string | null>(null);

  useEffect(() => {
    load();
    loadTimeAwareness();
  }, [load, loadTimeAwareness]);

  const ddlTasks = getTasksWithDdl(filtered);
  const noDdlTasks = getTasksWithoutDdl(filtered);
  const completed = getCompletedTasks(filtered).slice(0, 10);
  const now = new Date();
  const groups = groupByTimeHorizon(ddlTasks, now);
  const totalActive = ddlTasks.length + noDdlTasks.length;

  useEffect(() => {
    if (viewMode !== 'kanban' && kanbanFullscreen) {
      setKanbanFullscreen(false);
    }
  }, [kanbanFullscreen, viewMode]);

  useEffect(() => {
    if (!kanbanFullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setKanbanFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kanbanFullscreen]);

  const handlePostpone = async (reason: string, newDate: Date) => {
    if (!postponingTask) return;
    await postponeTask(postponingTask.id, reason, newDate);
    setPostponingTask(null);
  };

  const handleSubmit = async (note: string) => {
    if (!submittingTask) return;
    await submitTask(submittingTask.id, note);
    setSubmittingTask(null);
    setShowConfetti(true);
  };

  const handleClickTask = (task: Task) => {
    selectTask(task.id);
  };

  const handleContextMenu = (e: ContextMenuTriggerEvent, task: Task) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, task });
  };

  const handleAddSubtaskInline = async (taskId: string, title: string) => {
    await addSubtask(taskId, title);
  };

  const handleSetDdlInline = async (taskId: string, ddl: Date) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task) await updateTask({ ...task, ddl });
    setDdlInputId(null);
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

  const onTimeCount = completed.filter((t) =>
    t.submissions.length > 0 ? t.submissions[0]?.onTime : true,
  ).length;
  const onTimeRate = completed.length > 0 ? Math.round((onTimeCount / completed.length) * 100) : 0;

  return (
    <DndReparentProvider enabled={viewMode === 'list'}>
      <div
        className="h-full overflow-y-auto px-4 py-6 scroll-smooth"
        style={{ background: 'var(--color-bg)' }}
      >
        <div className="mx-auto max-w-2xl flex flex-col gap-8">
          {/* Stats card */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between rounded-2xl p-4 shadow-sm"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}
              >
                <Check size={20} strokeWidth={3} />
              </div>
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('On time completion')}
                </p>
                <p className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
                  {completed.length > 0 ? `${onTimeRate}%` : '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('Active tasks')}
                </p>
                <p className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
                  {totalActive}
                </p>
              </div>
              <div
                className="flex rounded-lg overflow-hidden ml-2"
                style={{ border: '1px solid var(--color-border)' }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="px-2 py-1.5 transition-colors"
                  title={t('List view')}
                  style={{
                    background: viewMode === 'list' ? 'var(--color-accent-soft)' : 'transparent',
                    color:
                      viewMode === 'list' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  }}
                >
                  <List size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('calendar')}
                  className="px-2 py-1.5 transition-colors"
                  title={t('Calendar view')}
                  style={{
                    background:
                      viewMode === 'calendar' ? 'var(--color-accent-soft)' : 'transparent',
                    color:
                      viewMode === 'calendar'
                        ? 'var(--color-accent)'
                        : 'var(--color-text-tertiary)',
                  }}
                >
                  <CalendarDays size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className="px-2 py-1.5 transition-colors"
                  title={t('Kanban view')}
                  style={{
                    background: viewMode === 'kanban' ? 'var(--color-accent-soft)' : 'transparent',
                    color:
                      viewMode === 'kanban' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  }}
                >
                  <LayoutGrid size={14} />
                </button>
              </div>
              {viewMode === 'kanban' && (
                <button
                  type="button"
                  onClick={() => setKanbanFullscreen(true)}
                  className="ml-2 flex items-center gap-1 rounded-xl border px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-bg)]"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-secondary)',
                    background: 'var(--color-surface)',
                  }}
                >
                  <Maximize2 size={13} />
                  总览
                </button>
              )}
            </div>
          </motion.div>

          {/* Kanban view */}
          {viewMode === 'kanban' && (
            <section>
              <KanbanBoard tasks={filtered} presentation="embedded" />
            </section>
          )}

          {/* Calendar view */}
          {viewMode === 'calendar' && (
            <CalendarView
              tasks={filtered}
              schedules={timeAwarenessEnabled ? scheduleBlocks : []}
              onSelectTask={(id) => selectTask(id)}
            />
          )}

          {/* DDL tasks grouped by urgency */}
          {viewMode === 'list' && (
            <>
              {totalActive === 0 && (
                <div
                  className="rounded-2xl border-dashed py-12 text-center"
                  style={{ border: '1px dashed var(--color-border)' }}
                >
                  <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t('No tasks yet')}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t('Write something in the stream, or click + to create directly')}
                  </p>
                </div>
              )}

              {groups.map((group) => (
                <section key={group.key}>
                  <div className="mb-4 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ background: group.color }} />
                    <h2
                      className="text-sm font-bold tracking-wide"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {t(group.label)}
                    </h2>
                    <span
                      className="text-xs font-medium"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {group.tasks.length}
                    </span>
                    <div
                      className="h-px flex-1"
                      style={{
                        background: 'linear-gradient(to right, var(--color-border), transparent)',
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-4">
                    <AnimatePresence>
                      {group.tasks.map((item, index) => (
                        <div key={item.id}>
                          <DndTaskWrapper taskId={item.id}>
                            <TaskCard
                              task={item}
                              index={index}
                              now={now}
                              onComplete={setSubmittingTask}
                              onPostpone={setPostponingTask}
                              onClick={handleClickTask}
                              onContextMenu={handleContextMenu}
                            />
                          </DndTaskWrapper>
                          {subtaskInputId === item.id && (
                            <BoardInlineSubtaskInput
                              onAdd={(title) => handleAddSubtaskInline(item.id, title)}
                              onCancel={() => setSubtaskInputId(null)}
                            />
                          )}
                          {ddlInputId === item.id && (
                            <BoardInlineDdlInput
                              onSet={(ddl) => handleSetDdlInline(item.id, ddl)}
                              onCancel={() => setDdlInputId(null)}
                            />
                          )}
                        </div>
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              ))}

              {/* No-DDL tasks (collapsible) */}
              {noDdlTasks.length > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => setShowNoDdl(!showNoDdl)}
                    className="mb-4 flex w-full items-center gap-2"
                  >
                    {showNoDdl ? (
                      <ChevronDown size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                    ) : (
                      <ChevronRight size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                    )}
                    <h2
                      className="text-sm font-bold tracking-wide"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {t('To-do')}
                    </h2>
                    <span
                      className="text-xs font-medium"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {noDdlTasks.length}
                    </span>
                    <div
                      className="h-px flex-1"
                      style={{
                        background: 'linear-gradient(to right, var(--color-border), transparent)',
                      }}
                    />
                  </button>
                  <AnimatePresence>
                    {showNoDdl && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex flex-col gap-3 overflow-hidden"
                      >
                        {noDdlTasks.map((task, i) => (
                          <div key={task.id}>
                            <DndTaskWrapper taskId={task.id}>
                              <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.04 }}
                                className="group rounded-xl px-4 py-3 cursor-pointer transition-colors hover:shadow-sm"
                                style={{
                                  background: 'var(--color-surface)',
                                  border: '1px solid var(--color-border)',
                                }}
                                onClick={() => handleClickTask(task)}
                                onContextMenu={(e) => handleContextMenu(e, task)}
                              >
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    className="flex shrink-0 items-center justify-center rounded-full transition-colors"
                                    style={{
                                      width: 18,
                                      height: 18,
                                      border: '2px solid var(--color-accent)',
                                      background: 'transparent',
                                    }}
                                    title={t('Mark complete')}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateStatus(task.id, 'completed');
                                      setShowConfetti(true);
                                    }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p
                                      className="text-sm font-medium truncate"
                                      style={{ color: 'var(--color-text)' }}
                                    >
                                      {displayTaskTitle(task)}
                                    </p>
                                    {task.parentId &&
                                      task.promoted &&
                                      (() => {
                                        const parent = tasks.find((t) => t.id === task.parentId);
                                        return parent ? (
                                          <p
                                            className="text-[10px] truncate mt-0.5"
                                            style={{ color: 'var(--color-text-tertiary)' }}
                                          >
                                            ↳ {displayTaskTitle(parent)}
                                          </p>
                                        ) : null;
                                      })()}
                                    <div className="mt-1 flex items-center gap-2">
                                      <RolePillMulti
                                        roleIds={taskRoleIds(task)}
                                        onChangeRoleIds={(ids) => {
                                          useTaskStore
                                            .getState()
                                            .updateTask({ ...task, ...withTaskRoles(task, ids) });
                                        }}
                                      />
                                      {(task.subtaskIds ?? []).length > 0 && (
                                        <span
                                          className="text-[10px]"
                                          style={{ color: 'var(--color-text-tertiary)' }}
                                        >
                                          {t('{{completed}}/{{total}} subtasks', {
                                            completed: (task.subtaskIds ?? []).filter(
                                              (id) =>
                                                tasks.find((t) => t.id === id)?.status ===
                                                'completed',
                                            ).length,
                                            total: (task.subtaskIds ?? []).length,
                                          })}
                                        </span>
                                      )}
                                      {(() => {
                                        const subs = (task.subtaskIds ?? [])
                                          .map((id) => tasks.find((t) => t.id === id))
                                          .filter(
                                            (t): t is Task =>
                                              !!t &&
                                              !!t.ddl &&
                                              t.status !== 'completed' &&
                                              daysUntil(t.ddl, now) <= 3,
                                          );
                                        if (subs.length === 0) return null;
                                        return (
                                          <span
                                            className="flex items-center gap-0.5 text-[10px]"
                                            style={{ color: 'var(--color-warning)' }}
                                          >
                                            <AlertCircle size={9} />
                                            {t('{{count}} subtasks due soon', {
                                              count: subs.length,
                                            })}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      handleContextMenu(createContextMenuTriggerEvent(rect), task);
                                    }}
                                    className="rounded-md p-1 transition-colors hover:bg-[var(--color-bg)] sm:opacity-0 sm:group-hover:opacity-100"
                                    style={{ color: 'var(--color-text-tertiary)' }}
                                  >
                                    <MoreHorizontal size={14} />
                                  </button>
                                  <ChevronRight
                                    size={16}
                                    className="hidden sm:block"
                                    style={{ color: 'var(--color-text-tertiary)' }}
                                  />
                                </div>

                                <BoardSubtaskPreview task={task} />
                              </motion.div>
                            </DndTaskWrapper>
                            {subtaskInputId === task.id && (
                              <BoardInlineSubtaskInput
                                onAdd={(title) => handleAddSubtaskInline(task.id, title)}
                                onCancel={() => setSubtaskInputId(null)}
                              />
                            )}
                            {ddlInputId === task.id && (
                              <BoardInlineDdlInput
                                onSet={(ddl) => handleSetDdlInline(task.id, ddl)}
                                onCancel={() => setDdlInputId(null)}
                              />
                            )}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              )}

              {/* Completed (collapsible) */}
              {completed.length > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="mb-4 flex w-full items-center gap-2"
                  >
                    {showCompleted ? (
                      <ChevronDown size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                    ) : (
                      <ChevronRight size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                    )}
                    <h2
                      className="text-sm font-bold tracking-wide"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {t('Recently completed')}
                    </h2>
                    <span
                      className="text-xs font-medium"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {completed.length}
                    </span>
                    <div
                      className="h-px flex-1"
                      style={{
                        background: 'linear-gradient(to right, var(--color-border), transparent)',
                      }}
                    />
                  </button>
                  <AnimatePresence>
                    {showCompleted && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex flex-col gap-2 overflow-hidden"
                      >
                        {completed.map((item, index) => (
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            key={item.id}
                            className="group flex items-center gap-4 rounded-xl px-4 py-3 cursor-pointer transition-colors"
                            style={{
                              background:
                                'color-mix(in srgb, var(--color-success-soft) 50%, transparent)',
                            }}
                            onClick={() => handleClickTask(item)}
                          >
                            <div
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                              style={{
                                background:
                                  'color-mix(in srgb, var(--color-success) 20%, transparent)',
                                color: 'var(--color-success)',
                              }}
                            >
                              <Check size={16} strokeWidth={3} />
                            </div>
                            <div className="flex-1">
                              <p
                                className="text-sm font-medium line-through"
                                style={{
                                  color: 'var(--color-text)',
                                  textDecorationColor:
                                    'color-mix(in srgb, var(--color-text-tertiary) 50%, transparent)',
                                }}
                              >
                                {displayTaskTitle(item)}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {item.completedAt && (
                                  <p
                                    className="text-xs"
                                    style={{ color: 'var(--color-text-tertiary)' }}
                                  >
                                    {t('{{month}}/{{day}}', {
                                      month: item.completedAt.getMonth() + 1,
                                      day: item.completedAt.getDate(),
                                    })}
                                  </p>
                                )}
                                {item.submissions.length > 0 && item.submissions[0]?.note && (
                                  <p
                                    className="text-xs italic"
                                    style={{ color: 'var(--color-text-tertiary)' }}
                                  >
                                    「{item.submissions[0].note}」
                                  </p>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                handleContextMenu(createContextMenuTriggerEvent(rect), item);
                              }}
                              className="rounded-md p-1 transition-colors hover:bg-[var(--color-bg)] sm:opacity-0 sm:group-hover:opacity-100"
                              style={{ color: 'var(--color-text-tertiary)' }}
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            <ChevronRight
                              size={16}
                              className="hidden sm:block opacity-0 transition-opacity group-hover:opacity-100"
                              style={{ color: 'var(--color-text-tertiary)' }}
                            />
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              )}
            </>
          )}
        </div>

        {/* Dialogs */}
        <AnimatePresence>
          {postponingTask && (
            <PostponeDialog
              task={postponingTask}
              onSubmit={handlePostpone}
              onCancel={() => setPostponingTask(null)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {submittingTask && (
            <SubmitDialog
              task={submittingTask}
              onSubmit={handleSubmit}
              onCancel={() => setSubmittingTask(null)}
            />
          )}
        </AnimatePresence>

        {showConfetti && <ConfettiOverlay onDone={() => setShowConfetti(false)} />}

        <AnimatePresence>
          {kanbanFullscreen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{
                background: 'color-mix(in srgb, var(--color-bg) 94%, transparent)',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
              }}
            >
              <div className="flex h-full flex-col px-4 pb-4 pt-[calc(12px+var(--safe-area-top))]">
                <div
                  className="mx-auto mb-3 flex w-full max-w-[1400px] items-center justify-between rounded-[var(--radius-panel)] border px-4 py-3"
                  style={{
                    background: 'color-mix(in srgb, var(--color-surface) 94%, var(--color-bg))',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  <div className="min-w-0">
                    <p
                      className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      看板总览
                    </p>
                    <h2 className="mt-1 text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                      全屏看板
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setKanbanFullscreen(false)}
                    className="flex items-center gap-1 rounded-xl border px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-bg)]"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                  >
                    <Minimize2 size={13} />
                    关闭
                  </button>
                </div>

                <div className="mx-auto min-h-0 w-full max-w-[1400px] flex-1 overflow-hidden">
                  <div className="h-full overflow-y-auto">
                    <KanbanBoard tasks={filtered} presentation="fullscreen" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {contextMenu && (
          <TaskContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            task={contextMenu.task}
            onClose={() => setContextMenu(null)}
            onOpenDetail={() => selectTask(contextMenu.task.id)}
            onAddSubtask={() => setSubtaskInputId(contextMenu.task.id)}
            onSetDdl={() => setDdlInputId(contextMenu.task.id)}
            onChangeRole={(roleId) => updateTask({ ...contextMenu.task, roleId })}
            onComplete={() => {
              const newStatus = contextMenu.task.status === 'completed' ? 'active' : 'completed';
              updateStatus(contextMenu.task.id, newStatus);
              if (newStatus === 'completed') setShowConfetti(true);
            }}
            onArchive={() => updateStatus(contextMenu.task.id, 'archived')}
            onDelete={() => deleteTask(contextMenu.task.id)}
            onPromote={
              contextMenu.task.parentId
                ? () => {
                    const { promoteSubtask } = useTaskStore.getState();
                    promoteSubtask(contextMenu.task.id, !contextMenu.task.promoted);
                  }
                : undefined
            }
            onSetParent={() => setParentPickerTargetId(contextMenu.task.id)}
            onDoItNow={() => useNowOverrideStore.getState().requestDoItNow(contextMenu.task.id)}
            onBoostPriority={() => {
              const tk = contextMenu.task;
              updateTask({
                ...tk,
                priority: Math.min(10, (tk.priority ?? 5) + 1),
                status: tk.status === 'inbox' || tk.status === 'active' ? 'today' : tk.status,
              });
            }}
          />
        )}

        {parentPickerTargetId && (
          <ParentTaskPicker
            childId={parentPickerTargetId}
            onSelect={async (parentId) => {
              await reparentTask(parentPickerTargetId, parentId);
              setParentPickerTargetId(null);
            }}
            onClose={() => setParentPickerTargetId(null)}
          />
        )}
      </div>
    </DndReparentProvider>
  );
}

/* ── Inline helpers for BoardView ── */

function BoardInlineSubtaskInput({
  onAdd,
  onCancel,
}: {
  onAdd: (title: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('board');
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2"
      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-accent)' }}
    >
      <ListPlus size={14} style={{ color: 'var(--color-accent)' }} />
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            onAdd(value.trim());
            setValue('');
          }
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={t('Enter subtask title, press Enter to add...')}
        className="flex-1 bg-transparent text-[13px] outline-none"
        style={{ color: 'var(--color-text)' }}
      />
      <button
        type="button"
        onClick={onCancel}
        className="rounded p-0.5"
        style={{ color: 'var(--color-text-tertiary)' }}
        title={t('Close')}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function BoardInlineDdlInput({
  onSet,
  onCancel,
}: {
  onSet: (ddl: Date) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('board');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2"
      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-accent)' }}
    >
      <Calendar size={14} style={{ color: 'var(--color-accent)' }} />
      <input
        ref={ref}
        type="datetime-local"
        title={t('Select deadline')}
        onChange={(e) => {
          if (e.target.value) {
            onSet(new Date(e.target.value));
          }
        }}
        className="flex-1 bg-transparent text-[13px] outline-none"
        style={{ color: 'var(--color-text)' }}
      />
      <button
        type="button"
        onClick={onCancel}
        className="rounded p-0.5"
        style={{ color: 'var(--color-text-tertiary)' }}
        title={t('Close')}
      >
        <X size={14} />
      </button>
    </div>
  );
}
