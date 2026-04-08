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
import { displayTaskTitle, estimateTaskProgress, taskRoleIds } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useExecCoachStore, useKanbanUiStore, useRoleStore, useTaskStore } from '../stores';
import { countWipTasks } from '../stores/taskStore';
import type { KanbanGroupMode } from '../utils/kanbanUtils';
import {
  KANBAN_COLUMNS,
  buildKanbanDropPatch,
  bucketTasksForGroupMode,
  deriveKanbanColumn,
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
    opacity: isDragging ? 0.7 : 1,
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderLeftWidth: 4,
    borderLeftColor: priorityBorder,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      layout
      className="rounded-xl px-3 py-2.5 cursor-grab active:cursor-grabbing"
      onDoubleClick={() => selectTask(task.id)}
      onPointerDown={() => setKanbanFocusTaskId(task.id)}
    >
      <div className="flex items-start gap-2">
        <ProgressRing progress={progress} size={28} stroke={2} />
        <div className="min-w-0 flex-1">
          <p
            className="text-[13px] font-semibold leading-snug"
            style={{ color: 'var(--color-text)' }}
          >
            {displayTaskTitle(task)}
          </p>
          {task.ddl && (
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              {task.ddl.toLocaleDateString()}
            </p>
          )}
          {taskRoleIds(task).length > 0 && (
            <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-text-tertiary)' }}>
              {taskRoleIds(task)
                .map((id) => roles.find((r) => r.id === id)?.name ?? id)
                .join(' · ')}
            </p>
          )}
        </div>
      </div>
    </motion.div>
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
}) {
  const { t } = useTranslation('board');
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        className="flex min-h-[200px] w-14 shrink-0 flex-col items-center justify-center rounded-2xl py-2 px-1"
        style={{
          background: isOver ? 'var(--color-accent-soft)' : 'var(--color-surface)',
          border: `1px solid ${isOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
        }}
        title={t(hintKey)}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="group flex flex-col items-center gap-2 rounded-xl p-1.5 w-full"
          style={{ color: 'var(--color-text-secondary)' }}
          title={t('Expand column')}
        >
          <ChevronRight
            size={18}
            className="transition-colors group-hover:text-[var(--color-accent)]"
          />
          <div className="flex flex-col items-center gap-2 min-h-[100px] justify-center">
            <span
              className="block text-[11px] font-bold whitespace-nowrap leading-none -rotate-90 origin-center max-w-[120px] truncate"
              style={{ color: 'var(--color-text)' }}
              title={columnTitle}
            >
              {columnTitle}
            </span>
            <span
              className="rounded-full min-w-[1.35rem] px-1.5 py-0.5 text-center text-[10px] font-bold"
              style={{
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
              }}
            >
              {tasks.length}
            </span>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[200px] min-w-[240px] flex-1 flex-col rounded-2xl p-2 transition-[box-shadow] duration-500"
      style={{
        background: isOver
          ? 'color-mix(in srgb, var(--color-accent-soft) 90%, var(--color-surface))'
          : 'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 96%, var(--color-bg)), var(--color-surface))',
        border: `1px solid ${isOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
        boxShadow: flash
          ? '0 0 0 2px color-mix(in srgb, var(--color-success) 45%, transparent)'
          : undefined,
      }}
    >
      <div className="mb-1 flex items-start justify-between gap-1 px-1">
        <div className="min-w-0" title={t(hintKey)}>
          <div className="flex items-center gap-1">
            <span
              className="text-[11px] font-bold uppercase tracking-wide truncate min-w-0"
              style={{ color: 'var(--color-text-secondary)' }}
              title={columnTitle}
            >
              {columnTitle}
            </span>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded p-0.5 hover:bg-[var(--color-bg)]"
              style={{ color: 'var(--color-text-tertiary)' }}
              title={t('Collapse column')}
              aria-label={t('Collapse column')}
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>
        <span
          className="text-[10px] font-medium shrink-0 tabular-nums"
          style={{
            color: highlightWip ? 'var(--color-danger)' : 'var(--color-text-tertiary)',
          }}
        >
          {tasks.length}
          {showWipRatio && col.id === 'doing' ? ` / ${wipLimit}` : ''}
        </span>
      </div>
      <div className="flex flex-col gap-2 min-h-[80px]">
        <AnimatePresence>
          {tasks.map((task) => (
            <KanbanCard key={task.id} task={task} allTasks={allTasks} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface KanbanBoardProps {
  tasks: Task[];
}

const COLUMN_HINT_KEYS: Record<KanbanColumn, string> = {
  ideas: 'column_hint_ideas',
  planned: 'column_hint_planned',
  doing: 'column_hint_doing',
  finishing: 'column_hint_finishing',
  done_recent: 'column_hint_done',
};

export function KanbanBoard({ tasks }: KanbanBoardProps) {
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

  const columnTitles = useMemo(() => {
    const roleName = (id: string | undefined) =>
      id ? roles.find((r) => r.id === id)?.name ?? id : '—';
    if (groupMode === 'status') {
      return Object.fromEntries(KANBAN_COLUMNS.map((c) => [c.id, t(c.labelKey)])) as Record<
        KanbanColumn,
        string
      >;
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
    const finLabel = [roleName(r2), roleName(r3)].filter((x) => x !== '—').join(' · ') || '—';
    return {
      ideas: t('Unassigned'),
      planned: roleName(r0),
      doing: roleName(r1),
      finishing: finLabel,
      done_recent: t('Recently done'),
    };
  }, [t, groupMode, roleColumnIds, roles]);

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
    const targetCol = KANBAN_COLUMNS.find((c) => c.id === overId)?.id;
    if (!targetCol) return;

    const task = allTasks.find((x) => x.id === taskId);
    if (!task) return;

    if (targetCol === 'done_recent') {
      setFlashDone(true);
      setTimeout(() => setFlashDone(false), 700);
    }

    const patch = buildKanbanDropPatch(task, targetCol, groupMode, roleColumnIds);
    updateTask({ ...task, ...patch } as Task);
  };

  const activeDragTask = activeDragId ? allTasks.find((x) => x.id === activeDragId) : undefined;

  const flatKanbanTasks = useMemo(
    () => KANBAN_COLUMNS.flatMap((c) => buckets[c.id]),
    [buckets],
  );

  const moveFocus = useCallback(
    (delta: number) => {
      const selectTask = useTaskStore.getState().selectTask;
      const idx = flatKanbanTasks.findIndex(
        (x) => x.id === useKanbanUiStore.getState().kanbanFocusTaskId,
      );
      const next = idx < 0 ? 0 : Math.min(Math.max(0, idx + delta), flatKanbanTasks.length - 1);
      const t = flatKanbanTasks[next];
      if (t) {
        useKanbanUiStore.getState().setKanbanFocusTaskId(t.id);
        selectTask(t.id);
      }
    },
    [flatKanbanTasks],
  );

  const moveColumn = useCallback(
    (dir: -1 | 1) => {
      const focusId = useKanbanUiStore.getState().kanbanFocusTaskId;
      const task = focusId ? allTasks.find((x) => x.id === focusId) : flatKanbanTasks[0];
      if (!task) return;
      const fromCol =
        (KANBAN_COLUMNS.map((c) => c.id) as KanbanColumn[]).find((id) =>
          buckets[id].some((x) => x.id === task.id),
        ) ?? deriveKanbanColumn(task, allTasks);
      const ci = KANBAN_COLUMNS.findIndex((c) => c.id === fromCol);
      const ni = Math.min(Math.max(0, ci + dir), KANBAN_COLUMNS.length - 1);
      const target = KANBAN_COLUMNS[ni]?.id;
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
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).closest('input,textarea,select,[contenteditable]'))
        return;
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        moveFocus(1);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        moveFocus(-1);
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        moveColumn(-1);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        moveColumn(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moveColumn, moveFocus]);

  return (
    <div className="flex flex-col gap-3" data-kanban-board tabIndex={-1}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-0.5">
        <p
          className="text-[11px] leading-relaxed flex-1 min-w-0"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {t('kanban_welcome_line')}
        </p>
        <label
          className="flex items-center gap-1.5 shrink-0 text-[11px]"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <span className="whitespace-nowrap">{t('Group by')}</span>
          <div className="relative">
            <select
              value={groupMode}
              onChange={(e) => setGroupMode(e.target.value as KanbanGroupMode)}
              className="appearance-none rounded-lg pl-2 pr-7 py-1.5 text-[11px] font-medium cursor-pointer max-w-[10rem]"
              style={{
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
              aria-label={t('Group by')}
            >
              <option value="status">{t('kanban_group_status')}</option>
              <option value="priority">{t('kanban_group_priority')}</option>
              <option value="role">{t('kanban_group_role')}</option>
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 opacity-45"
              aria-hidden
            />
          </div>
        </label>
      </div>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {KANBAN_COLUMNS.map((col) => (
            <BoardColumn
              key={col.id}
              col={col}
              tasks={buckets[col.id]}
              allTasks={allTasks}
              wipLimit={wipLimit}
              collapsed={Boolean(collapsed[col.id])}
              onToggleCollapse={() => toggleColumn(col.id)}
              hintKey={COLUMN_HINT_KEYS[col.id]}
              flash={col.id === 'done_recent' && flashDone}
              columnTitle={columnTitles[col.id] ?? t(col.labelKey)}
              showWipRatio={groupMode === 'status'}
              highlightWip={
                groupMode === 'status' && col.id === 'doing' && doingCount > wipLimit
              }
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 200 }}>
          {activeDragTask ? (
            <div
              className="rounded-xl px-3 py-2.5 shadow-2xl max-w-[280px]"
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
