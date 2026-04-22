import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { KanbanColumn, Task } from '@my-little-todo/core';
import {
  displayTaskTitle,
  estimateTaskProgress,
  isOverdue,
  taskRoleIds,
} from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, FolderKanban } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type KanbanDoneRailMode,
  type KanbanEmptyLaneMode,
  type KanbanSummaryDensity,
  loadKanbanSettings,
} from '../features/kanban/KanbanSettings';
import { useExecCoachStore, useKanbanUiStore, useRoleStore, useTaskStore } from '../stores';
import { countWipTasks } from '../stores/taskStore';
import type { KanbanGroupMode } from '../utils/kanbanUtils';
import {
  KANBAN_COLUMNS,
  bucketTasksForGroupMode,
  buildKanbanDropPatch,
  deriveKanbanColumn,
  groupColumnTasksByProject,
} from '../utils/kanbanUtils';
import { ProgressRing } from './ProgressRing';

function KanbanCard({
  task,
  allTasks,
}: {
  task: Task;
  allTasks: Task[];
}) {
  const selectTask = useTaskStore((s) => s.selectTask);
  const setKanbanFocusTaskId = useKanbanUiStore((s) => s.setKanbanFocusTaskId);
  const roles = useRoleStore((s) => s.roles);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const progress = estimateTaskProgress(task, allTasks);
  const pr = task.priority ?? 0;
  const priorityBorder =
    pr >= 8
      ? 'var(--color-danger)'
      : pr >= 5
        ? 'var(--color-warning)'
        : pr >= 2
          ? 'var(--color-accent)'
          : 'transparent';
  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.72 : 1,
    background: 'color-mix(in srgb, var(--color-surface) 95%, var(--color-bg))',
    border: '1px solid color-mix(in srgb, var(--color-border) 84%, transparent)',
    borderLeftWidth: 3,
    borderLeftColor: priorityBorder,
    boxShadow: '0 10px 22px color-mix(in srgb, var(--color-text) 5%, transparent)',
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  };
  const roleNames = taskRoleIds(task)
    .map((id) => roles.find((r) => r.id === id)?.name ?? id)
    .filter(Boolean);
  const metaLine = [task.ddl ? task.ddl.toLocaleDateString() : null, roleNames.join(' · ') || null]
    .filter(Boolean)
    .join(' · ');

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      layout
      className="cursor-grab rounded-[var(--radius-card)] px-3 py-3 active:cursor-grabbing"
      onDoubleClick={() => selectTask(task.id)}
      onPointerDown={() => {
        setKanbanFocusTaskId(task.id);
      }}
    >
      <div className="flex items-start gap-2.5">
        <ProgressRing progress={progress} size={24} stroke={2} />
        <div className="min-w-0 flex-1">
          <p
            className="flex items-start gap-1.5 text-[12.5px] font-semibold leading-snug"
            style={{ color: 'var(--color-text)' }}
          >
            {task.taskType === 'project' && (
              <FolderKanban
                size={14}
                className="mt-0.5 shrink-0"
                style={{ color: 'var(--color-accent)' }}
              />
            )}
            <span className="line-clamp-2">{displayTaskTitle(task)}</span>
          </p>
          {metaLine ? (
            <p
              className="mt-1 truncate text-[10px]"
              style={{ color: 'var(--color-text-tertiary)' }}
              title={metaLine}
            >
              {metaLine}
            </p>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

function CompactColumn({
  title,
  count,
  hint,
  isOver,
  collapsed,
  onToggleCollapse,
}: {
  title: string;
  count: number;
  hint: string;
  isOver: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <div
      className={`flex min-h-[240px] shrink-0 flex-col items-center justify-center rounded-[22px] border px-1 py-3 transition-all ${
        collapsed ? 'w-14' : 'w-[88px]'
      }`}
      style={{
        background: isOver
          ? 'color-mix(in srgb, var(--color-accent-soft) 86%, var(--color-surface))'
          : 'color-mix(in srgb, var(--color-surface) 94%, var(--color-bg))',
        borderColor: isOver ? 'var(--color-accent)' : 'var(--color-border)',
      }}
      title={hint}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="group flex w-full flex-col items-center gap-2 rounded-xl p-1.5"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <ChevronRight
            size={18}
            className="transition-colors group-hover:text-[var(--color-accent)]"
          />
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-2">
            <span
              className="block max-w-[120px] truncate whitespace-nowrap text-[11px] font-semibold leading-none -rotate-90"
              style={{ color: 'var(--color-text)' }}
            >
              {title}
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
              }}
            >
              {count}
            </span>
          </div>
        </button>
      ) : (
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 text-center">
          <span
            className="text-[11px] font-semibold leading-snug"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {title}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: isOver ? 'var(--color-accent)' : 'var(--color-bg)',
              color: isOver ? 'white' : 'var(--color-text-secondary)',
            }}
          >
            {count}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {isOver ? 'Drop here' : 'Empty lane'}
          </span>
        </div>
      )}
    </div>
  );
}

function BoardColumn({
  col,
  tasks,
  allTasks,
  wipLimit,
  collapsed,
  onToggleCollapse,
  hintKey,
  flash,
  columnTitle,
  showWipRatio,
  highlightWip,
  groupMode,
  ungroupedProjectLabel,
  compressWhenEmpty,
}: {
  col: (typeof KANBAN_COLUMNS)[number];
  tasks: Task[];
  allTasks: Task[];
  wipLimit: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  hintKey: string;
  flash: boolean;
  columnTitle: string;
  showWipRatio: boolean;
  highlightWip: boolean;
  groupMode: KanbanGroupMode;
  ungroupedProjectLabel: string;
  compressWhenEmpty: boolean;
}) {
  const { t } = useTranslation('board');
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const projectGroups =
    groupMode === 'project'
      ? groupColumnTasksByProject(tasks, allTasks, ungroupedProjectLabel)
      : null;
  const compressed = compressWhenEmpty && tasks.length === 0 && !isOver;

  if (collapsed || compressed) {
    return (
      <div ref={setNodeRef}>
        <CompactColumn
          title={columnTitle}
          count={tasks.length}
          hint={t(hintKey)}
          isOver={isOver}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[240px] min-w-[240px] flex-1 flex-col rounded-[var(--radius-panel)] p-2.5 transition-[box-shadow,border-color] duration-300"
      style={{
        background: isOver
          ? 'color-mix(in srgb, var(--color-accent-soft) 88%, var(--color-surface))'
          : 'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 98%, var(--color-bg)), var(--color-surface))',
        border: `1px solid ${isOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
        boxShadow: flash
          ? '0 0 0 2px color-mix(in srgb, var(--color-success) 42%, transparent)'
          : undefined,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="truncate text-[12px] font-semibold"
              style={{ color: 'var(--color-text)' }}
              title={columnTitle}
            >
              {columnTitle}
            </span>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded-full p-1 transition-colors hover:bg-[var(--color-bg)]"
              style={{ color: 'var(--color-text-tertiary)' }}
              title={t('Collapse column')}
              aria-label={t('Collapse column')}
            >
              <ChevronLeft size={14} />
            </button>
          </div>
          <p className="mt-0.5 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {t(hintKey)}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{
            background: highlightWip
              ? 'color-mix(in srgb, var(--color-danger) 12%, transparent)'
              : 'color-mix(in srgb, var(--color-bg) 92%, transparent)',
            color: highlightWip ? 'var(--color-danger)' : 'var(--color-text-secondary)',
          }}
        >
          {tasks.length}
          {showWipRatio && col.id === 'doing' ? ` / ${wipLimit}` : ''}
        </span>
      </div>
      <div className="flex min-h-[120px] flex-col gap-2">
        <AnimatePresence initial={false}>
          {projectGroups
            ? projectGroups.map((group) => (
                <div key={`${col.id}-${group.label}`} className="flex flex-col gap-2">
                  <p
                    className="px-1 text-[10px] font-medium"
                    style={{ color: 'var(--color-text-tertiary)' }}
                    title={group.label}
                  >
                    {group.label}
                  </p>
                  {group.tasks.map((task) => (
                    <KanbanCard key={task.id} task={task} allTasks={allTasks} />
                  ))}
                </div>
              ))
            : tasks.map((task) => <KanbanCard key={task.id} task={task} allTasks={allTasks} />)}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DoneRail({
  tasks,
  allTasks,
  collapsed,
  onToggleCollapse,
  flash,
  title,
  hint,
  railMode,
  presentation,
}: {
  tasks: Task[];
  allTasks: Task[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  flash: boolean;
  title: string;
  hint: string;
  railMode: KanbanDoneRailMode;
  presentation: 'embedded' | 'fullscreen';
}) {
  const { t } = useTranslation('board');
  const { setNodeRef, isOver } = useDroppable({ id: 'done_recent' });

  if (collapsed) {
    return (
      <div ref={setNodeRef}>
        <CompactColumn
          title={title}
          count={tasks.length}
          hint={hint}
          isOver={isOver}
          collapsed
          onToggleCollapse={onToggleCollapse}
        />
      </div>
    );
  }

  return (
    <aside
      ref={setNodeRef}
      className={`flex min-h-[240px] shrink-0 flex-col rounded-[var(--radius-panel)] border p-2.5 transition-[box-shadow,border-color] duration-300 ${
        presentation === 'fullscreen' && railMode === 'expanded' ? 'w-[320px]' : 'w-[228px]'
      }`}
      style={{
        background: isOver
          ? 'color-mix(in srgb, var(--color-success-soft) 82%, var(--color-surface))'
          : 'linear-gradient(180deg, color-mix(in srgb, var(--color-success-soft) 36%, var(--color-surface)), var(--color-surface))',
        borderColor: isOver ? 'var(--color-success)' : 'var(--color-border)',
        boxShadow: flash
          ? '0 0 0 2px color-mix(in srgb, var(--color-success) 45%, transparent)'
          : undefined,
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="truncate text-[12px] font-semibold"
              style={{ color: 'var(--color-text)' }}
            >
              {title}
            </span>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded-full p-1 transition-colors hover:bg-[var(--color-bg)]"
              style={{ color: 'var(--color-text-tertiary)' }}
              title={t('Collapse column')}
              aria-label={t('Collapse column')}
            >
              <ChevronLeft size={14} />
            </button>
          </div>
          <p className="mt-0.5 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {hint}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{
            background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {tasks.length}
        </span>
      </div>

      <div className="flex-1 space-y-2">
        {tasks.length === 0 ? (
          <div
            className="flex min-h-[120px] items-center justify-center rounded-[var(--radius-card)] border border-dashed px-4 text-center text-[11px]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
          >
            Drag finished work here to review it without giving it a full lane.
          </div>
        ) : (
          tasks.map((task) => <KanbanCard key={task.id} task={task} allTasks={allTasks} />)
        )}
      </div>
    </aside>
  );
}

interface KanbanBoardProps {
  tasks: Task[];
  presentation?: 'embedded' | 'fullscreen';
}

const COLUMN_HINT_KEYS: Record<KanbanColumn, string> = {
  ideas: 'column_hint_ideas',
  planned: 'column_hint_planned',
  doing: 'column_hint_doing',
  finishing: 'column_hint_finishing',
  done_recent: 'column_hint_done',
};

export function KanbanBoard({ tasks, presentation = 'embedded' }: KanbanBoardProps) {
  const { t } = useTranslation('board');
  const updateTask = useTaskStore((s) => s.updateTask);
  const allTasks = useTaskStore((s) => s.tasks);
  const roles = useRoleStore((s) => s.roles);
  const wipLimit = useExecCoachStore((s) => s.wipLimit);
  const collapsed = useKanbanUiStore((s) => s.collapsed);
  const toggleColumn = useKanbanUiStore((s) => s.toggleColumn);
  const groupMode = useKanbanUiStore((s) => s.groupMode);
  const setGroupMode = useKanbanUiStore((s) => s.setGroupMode);
  const [flashDone, setFlashDone] = useState(false);
  const [summaryDensity, setSummaryDensity] = useState<KanbanSummaryDensity>('rich');
  const [emptyLaneMode, setEmptyLaneMode] = useState<KanbanEmptyLaneMode>('compressed');
  const [doneRailMode, setDoneRailMode] = useState<KanbanDoneRailMode>('rail');
  const [showWipAlert, setShowWipAlert] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadKanbanSettings().then((settings) => {
      if (cancelled) return;
      setSummaryDensity(settings.summaryDensity);
      setEmptyLaneMode(settings.emptyLaneMode);
      setDoneRailMode(settings.doneRailMode);
      setShowWipAlert(settings.showWipAlert);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const roleColumnIds = useMemo(
    () =>
      [...roles]
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 4)
        .map((r) => r.id),
    [roles],
  );

  const buckets = useMemo(
    () => bucketTasksForGroupMode(tasks, allTasks, groupMode, roleColumnIds),
    [tasks, allTasks, groupMode, roleColumnIds],
  );
  const doingCount = countWipTasks(tasks);
  const overdueCount = useMemo(
    () =>
      tasks.filter((task) => task.status !== 'completed' && task.ddl && isOverdue(task.ddl)).length,
    [tasks],
  );
  const mainColumns = useMemo(
    () => KANBAN_COLUMNS.filter((column) => column.id !== 'done_recent'),
    [],
  );

  const columnTitles = useMemo(() => {
    const roleName = (id: string | undefined) =>
      id ? (roles.find((r) => r.id === id)?.name ?? id) : '-';
    if (groupMode === 'status' || groupMode === 'project') {
      return Object.fromEntries(
        KANBAN_COLUMNS.map((column) => [column.id, t(column.labelKey)]),
      ) as Record<KanbanColumn, string>;
    }
    if (groupMode === 'priority') {
      return {
        ideas: t('kanban_pri_low'),
        planned: t('kanban_pri_mid'),
        doing: t('kanban_pri_high'),
        finishing: t('kanban_pri_urgent'),
        done_recent: t('Recently done'),
      };
    }
    const [r0, r1, r2, r3] = roleColumnIds;
    const finishingLabel =
      [roleName(r2), roleName(r3)].filter((item) => item !== '-').join(' · ') || '-';
    return {
      ideas: t('Unassigned'),
      planned: roleName(r0),
      doing: roleName(r1),
      finishing: finishingLabel,
      done_recent: t('Recently done'),
    };
  }, [groupMode, roleColumnIds, roles, t]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const taskId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    const targetCol = KANBAN_COLUMNS.find((column) => column.id === overId)?.id;
    if (!targetCol) return;

    const task = allTasks.find((item) => item.id === taskId);
    if (!task) return;

    if (targetCol === 'done_recent') {
      setFlashDone(true);
      window.setTimeout(() => setFlashDone(false), 700);
    }

    const patch = buildKanbanDropPatch(task, targetCol, groupMode, roleColumnIds);
    updateTask({ ...task, ...patch } as Task);
  };

  const activeDragTask = activeDragId
    ? allTasks.find((item) => item.id === activeDragId)
    : undefined;
  const flatKanbanTasks = useMemo(
    () => KANBAN_COLUMNS.flatMap((column) => buckets[column.id]),
    [buckets],
  );

  const moveFocus = useCallback(
    (delta: number) => {
      const selectTask = useTaskStore.getState().selectTask;
      const idx = flatKanbanTasks.findIndex(
        (item) => item.id === useKanbanUiStore.getState().kanbanFocusTaskId,
      );
      const next = idx < 0 ? 0 : Math.min(Math.max(0, idx + delta), flatKanbanTasks.length - 1);
      const task = flatKanbanTasks[next];
      if (task) {
        useKanbanUiStore.getState().setKanbanFocusTaskId(task.id);
        selectTask(task.id);
      }
    },
    [flatKanbanTasks],
  );

  const moveColumn = useCallback(
    (dir: -1 | 1) => {
      const focusId = useKanbanUiStore.getState().kanbanFocusTaskId;
      const task = focusId ? allTasks.find((item) => item.id === focusId) : flatKanbanTasks[0];
      if (!task) return;
      const fromCol =
        (KANBAN_COLUMNS.map((column) => column.id) as KanbanColumn[]).find((id) =>
          buckets[id].some((item) => item.id === task.id),
        ) ?? deriveKanbanColumn(task, allTasks);
      const currentIndex = KANBAN_COLUMNS.findIndex((column) => column.id === fromCol);
      const nextIndex = Math.min(Math.max(0, currentIndex + dir), KANBAN_COLUMNS.length - 1);
      const target = KANBAN_COLUMNS[nextIndex]?.id;
      if (!target || target === fromCol) return;
      const patch = buildKanbanDropPatch(
        task,
        target,
        useKanbanUiStore.getState().groupMode,
        roleColumnIds,
      );
      updateTask({ ...task, ...patch } as Task);
    },
    [allTasks, buckets, flatKanbanTasks, roleColumnIds, updateTask],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target &&
        (event.target as HTMLElement).closest('input,textarea,select,[contenteditable]')
      ) {
        return;
      }
      if (event.key === 'j' || event.key === 'J') {
        event.preventDefault();
        moveFocus(1);
      } else if (event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        moveFocus(-1);
      } else if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        moveColumn(-1);
      } else if (event.key === 'l' || event.key === 'L') {
        event.preventDefault();
        moveColumn(1);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moveColumn, moveFocus]);

  const recentDoneCount = buckets.done_recent.length;
  const highlightDoingWip =
    showWipAlert && (groupMode === 'status' || groupMode === 'project') && doingCount > wipLimit;
  const compressEmptyLanes = presentation === 'embedded' || emptyLaneMode === 'compressed';
  const summaryItems = [
    { label: '总任务', value: tasks.length, emphasize: false },
    { label: '进行中', value: doingCount, emphasize: highlightDoingWip },
    { label: '已逾期', value: overdueCount, emphasize: overdueCount > 0 },
    { label: '最近完成', value: recentDoneCount, emphasize: false },
  ];

  return (
    <div
      className="flex flex-col gap-3"
      data-kanban-board
      data-kanban-presentation={presentation}
      tabIndex={-1}
    >
      <div
        className={`flex flex-col gap-3 rounded-[var(--radius-panel)] border px-4 ${
          presentation === 'fullscreen'
            ? 'py-4'
            : 'py-3 sm:flex-row sm:items-start sm:justify-between'
        }`}
        style={{
          background: 'color-mix(in srgb, var(--color-surface) 94%, var(--color-bg))',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={
                presentation === 'fullscreen' ? 'text-base font-semibold' : 'text-sm font-semibold'
              }
              style={{ color: 'var(--color-text)' }}
            >
              {presentation === 'fullscreen' ? '看板总览' : t('Kanban view')}
            </h3>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                background: highlightDoingWip
                  ? 'color-mix(in srgb, var(--color-danger) 12%, transparent)'
                  : 'color-mix(in srgb, var(--color-bg) 92%, transparent)',
                color: highlightDoingWip ? 'var(--color-danger)' : 'var(--color-text-secondary)',
              }}
            >
              WIP {doingCount}/{wipLimit}
            </span>
          </div>
          <p
            className="mt-1 text-[11px] leading-relaxed"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {presentation === 'fullscreen'
              ? '更适合看全局推进、WIP 压力与最近完成情况。'
              : t('kanban_welcome_line')}
          </p>
          {presentation === 'fullscreen' && (
            <div
              className={`mt-3 grid gap-2 ${
                summaryDensity === 'compact'
                  ? 'grid-cols-2 xl:grid-cols-4'
                  : 'grid-cols-2 lg:grid-cols-4'
              }`}
            >
              {summaryItems.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[var(--radius-card)] border px-3 py-2.5"
                  style={{
                    background: 'color-mix(in srgb, var(--color-surface) 92%, var(--color-bg))',
                    borderColor: item.emphasize
                      ? 'color-mix(in srgb, var(--color-danger) 24%, var(--color-border))'
                      : 'var(--color-border)',
                  }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {item.label}
                  </p>
                  <p
                    className={`mt-1 ${summaryDensity === 'compact' ? 'text-lg' : 'text-xl'} font-semibold`}
                    style={{ color: item.emphasize ? 'var(--color-danger)' : 'var(--color-text)' }}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <label
          className="flex items-center gap-2 self-start rounded-full px-2.5 py-1.5 text-[11px]"
          style={{
            color: 'var(--color-text-secondary)',
            background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)',
            border: '1px solid var(--color-border)',
          }}
        >
          <span className="whitespace-nowrap">{t('Group by')}</span>
          <div className="relative">
            <select
              value={groupMode}
              onChange={(event) => setGroupMode(event.target.value as KanbanGroupMode)}
              className="max-w-[10rem] cursor-pointer appearance-none bg-transparent py-0.5 pl-0 pr-5 text-[11px] font-medium outline-none"
              style={{ color: 'var(--color-text)' }}
              aria-label={t('Group by')}
            >
              <option value="status">{t('kanban_group_status')}</option>
              <option value="priority">{t('kanban_group_priority')}</option>
              <option value="role">{t('kanban_group_role')}</option>
              <option value="project">{t('kanban_group_project')}</option>
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 opacity-45"
              aria-hidden
            />
          </div>
        </label>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          className={`flex overflow-x-auto pr-1 ${
            presentation === 'fullscreen' ? 'gap-4 pb-3' : 'gap-3 pb-2'
          }`}
        >
          {mainColumns.map((column) => (
            <BoardColumn
              key={column.id}
              col={column}
              tasks={buckets[column.id]}
              allTasks={allTasks}
              wipLimit={wipLimit}
              collapsed={Boolean(collapsed[column.id])}
              onToggleCollapse={() => toggleColumn(column.id)}
              hintKey={COLUMN_HINT_KEYS[column.id]}
              flash={false}
              columnTitle={columnTitles[column.id] ?? t(column.labelKey)}
              showWipRatio={groupMode === 'status' || groupMode === 'project'}
              highlightWip={column.id === 'doing' && highlightDoingWip}
              groupMode={groupMode}
              ungroupedProjectLabel={t('kanban_group_project_none')}
              compressWhenEmpty={compressEmptyLanes}
            />
          ))}

          <DoneRail
            tasks={buckets.done_recent}
            allTasks={allTasks}
            collapsed={Boolean(collapsed.done_recent)}
            onToggleCollapse={() => toggleColumn('done_recent')}
            flash={flashDone}
            title={columnTitles.done_recent ?? t('Recently done')}
            hint={t(COLUMN_HINT_KEYS.done_recent)}
            railMode={doneRailMode}
            presentation={presentation}
          />
        </div>

        <DragOverlay dropAnimation={{ duration: 200 }}>
          {activeDragTask ? (
            <div
              className="max-w-[280px] rounded-[var(--radius-card)] px-3 py-2.5 shadow-2xl"
              style={{
                background: 'var(--color-surface)',
                border: '2px solid var(--color-accent)',
              }}
            >
              <p className="text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>
                {displayTaskTitle(activeDragTask)}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
