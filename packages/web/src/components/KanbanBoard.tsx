import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { KanbanColumn, Task } from '@my-little-todo/core';
import { estimateTaskProgress } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useExecCoachStore, useTaskStore } from '../stores';
import { countWipTasks } from '../stores/taskStore';
import { KANBAN_COLUMNS, bucketTasksByKanban, deriveKanbanColumn } from '../utils/kanbanUtils';
import { ProgressRing } from './ProgressRing';

function KanbanCard({
  task,
  allTasks,
  wipLimit,
  doingCount,
}: {
  task: Task;
  allTasks: Task[];
  wipLimit: number;
  doingCount: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const progress = estimateTaskProgress(task, allTasks);
  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.7 : 1,
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      layout
      className="rounded-xl px-3 py-2.5 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <ProgressRing progress={progress} size={28} stroke={2} />
        <div className="min-w-0 flex-1">
          <p
            className="text-[13px] font-semibold leading-snug"
            style={{ color: 'var(--color-text)' }}
          >
            {task.title}
          </p>
          {task.ddl && (
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              {task.ddl.toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      {deriveKanbanColumn(task, allTasks) === 'doing' && doingCount > wipLimit && (
        <p className="text-[10px] mt-1 text-amber-600 dark:text-amber-400">
          WIP {doingCount}/{wipLimit}
        </p>
      )}
    </motion.div>
  );
}

function BoardColumn({
  col,
  tasks,
  allTasks,
  wipLimit,
  doingCount,
}: {
  col: (typeof KANBAN_COLUMNS)[number];
  tasks: Task[];
  allTasks: Task[];
  wipLimit: number;
  doingCount: number;
}) {
  const { t } = useTranslation('board');
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[200px] min-w-[200px] flex-1 flex-col rounded-2xl p-2"
      style={{
        background: isOver ? 'var(--color-accent-soft)' : 'var(--color-surface)',
        border: `1px solid ${isOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
      }}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span
          className="text-[11px] font-bold uppercase tracking-wide"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {t(col.labelKey)}
        </span>
        <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          {tasks.length}
          {col.id === 'doing' ? ` / ${wipLimit}` : ''}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <AnimatePresence>
          {tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              allTasks={allTasks}
              wipLimit={wipLimit}
              doingCount={doingCount}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface KanbanBoardProps {
  tasks: Task[];
}

function buildKanbanPatch(task: Task, targetCol: KanbanColumn): Partial<Task> {
  let patch: Partial<Task> = { kanbanColumn: targetCol };
  if (targetCol === 'doing' && task.status === 'inbox') {
    patch = { ...patch, status: 'active' };
  }
  if (targetCol === 'ideas' && task.status !== 'inbox') {
    patch = { ...patch, status: 'inbox' };
  }
  if (targetCol === 'done_recent') {
    patch = { ...patch, status: 'completed', completedAt: new Date() };
  }
  return patch;
}

export function KanbanBoard({ tasks }: KanbanBoardProps) {
  const { t } = useTranslation('board');
  const updateTask = useTaskStore((s) => s.updateTask);
  const allTasks = useTaskStore((s) => s.tasks);
  const wipLimit = useExecCoachStore((s) => s.wipLimit);
  const [wipHint, setWipHint] = useState<string | null>(null);

  const buckets = useMemo(() => bucketTasksByKanban(tasks, allTasks), [tasks, allTasks]);
  const doingCount = countWipTasks(tasks);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const taskId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    const targetCol = KANBAN_COLUMNS.find((c) => c.id === overId)?.id;
    if (!targetCol) return;

    const task = allTasks.find((x) => x.id === taskId);
    if (!task) return;

    if (
      targetCol === 'doing' &&
      doingCount >= wipLimit &&
      deriveKanbanColumn(task, allTasks) !== 'doing'
    ) {
      setWipHint(t('wip_soft_limit_hint', { limit: wipLimit }));
      setTimeout(() => setWipHint(null), 5000);
    }

    const patch = buildKanbanPatch(task, targetCol);
    updateTask({ ...task, ...patch } as Task);
  };

  return (
    <div className="flex flex-col gap-3">
      {wipHint && (
        <p
          className="text-xs rounded-xl px-3 py-2"
          style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning)' }}
        >
          {wipHint}
        </p>
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {KANBAN_COLUMNS.map((col) => (
            <BoardColumn
              key={col.id}
              col={col}
              tasks={buckets[col.id]}
              allTasks={allTasks}
              wipLimit={wipLimit}
              doingCount={doingCount}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
