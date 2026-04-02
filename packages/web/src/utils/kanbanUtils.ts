import type { KanbanColumn, Task } from '@my-little-todo/core';
import { estimateTaskProgress, isNearFinishing } from '@my-little-todo/core';

export const KANBAN_COLUMNS: { id: KanbanColumn; labelKey: string }[] = [
  { id: 'ideas', labelKey: 'Ideas pool' },
  { id: 'planned', labelKey: 'Planned' },
  { id: 'doing', labelKey: 'Doing' },
  { id: 'finishing', labelKey: 'Finishing' },
  { id: 'done_recent', labelKey: 'Recently done' },
];

/** Derive column when user has not set kanban_column explicitly. */
export function deriveKanbanColumn(task: Task, allTasks: Task[]): KanbanColumn {
  if (task.kanbanColumn) return task.kanbanColumn;
  if (task.status === 'completed') return 'done_recent';
  if (task.status === 'inbox') return 'ideas';
  if (isNearFinishing(task, allTasks) || estimateTaskProgress(task, allTasks) >= 0.65) {
    return 'finishing';
  }
  if (task.status === 'today' || task.phase === 'working' || task.phase === 'exploring') {
    return 'doing';
  }
  return 'planned';
}

export function bucketTasksByKanban(tasks: Task[], allTasks: Task[]): Record<KanbanColumn, Task[]> {
  const buckets: Record<KanbanColumn, Task[]> = {
    ideas: [],
    planned: [],
    doing: [],
    finishing: [],
    done_recent: [],
  };
  for (const t of tasks) {
    if (!t.parentId || t.promoted) {
      const col = deriveKanbanColumn(t, allTasks);
      buckets[col].push(t);
    }
  }
  for (const k of Object.keys(buckets) as KanbanColumn[]) {
    buckets[k].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  return buckets;
}
