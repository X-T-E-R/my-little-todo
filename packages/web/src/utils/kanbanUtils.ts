import type { KanbanColumn, Task } from '@my-little-todo/core';
import {
  displayTaskTitle,
  enclosingProject,
  estimateTaskProgress,
  isNearFinishing,
  taskRoleIds,
  withTaskRoles,
} from '@my-little-todo/core';

/** How tasks are grouped into the five Kanban columns. */
export type KanbanGroupMode = 'status' | 'priority' | 'role' | 'project';

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

function emptyBuckets(): Record<KanbanColumn, Task[]> {
  return {
    ideas: [],
    planned: [],
    doing: [],
    finishing: [],
    done_recent: [],
  };
}

/** Priority bands mapped to the five columns (non-completed tasks). */
export function bucketTasksByPriority(
  tasks: Task[],
  _allTasks: Task[],
): Record<KanbanColumn, Task[]> {
  const buckets = emptyBuckets();
  for (const t of tasks) {
    if (t.parentId && !t.promoted) continue;
    if (t.status === 'completed') {
      buckets.done_recent.push(t);
      continue;
    }
    const p = t.priority ?? 5;
    if (p <= 2) buckets.ideas.push(t);
    else if (p <= 4) buckets.planned.push(t);
    else if (p <= 6) buckets.doing.push(t);
    else if (p <= 8) buckets.finishing.push(t);
    else buckets.finishing.push(t);
  }
  for (const k of Object.keys(buckets) as KanbanColumn[]) {
    buckets[k].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  return buckets;
}

/**
 * Column ideas = unassigned; planned..finishing = first four roles in order; overflow → finishing;
 * completed → done_recent.
 */
export function bucketTasksByRole(
  tasks: Task[],
  _allTasks: Task[],
  roleColumnIds: string[],
): Record<KanbanColumn, Task[]> {
  const buckets = emptyBuckets();
  const [r0, r1, r2, r3] = [roleColumnIds[0], roleColumnIds[1], roleColumnIds[2], roleColumnIds[3]];

  for (const t of tasks) {
    if (t.parentId && !t.promoted) continue;
    if (t.status === 'completed') {
      buckets.done_recent.push(t);
      continue;
    }
    const ids = taskRoleIds(t);
    const first = ids[0];
    if (!first) {
      buckets.ideas.push(t);
      continue;
    }
    if (r0 && first === r0) buckets.planned.push(t);
    else if (r1 && first === r1) buckets.doing.push(t);
    else if (r2 && first === r2) buckets.finishing.push(t);
    else if (r3 && first === r3) buckets.finishing.push(t);
    else buckets.finishing.push(t);
  }
  for (const k of Object.keys(buckets) as KanbanColumn[]) {
    buckets[k].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  return buckets;
}

export function bucketTasksForGroupMode(
  tasks: Task[],
  allTasks: Task[],
  mode: KanbanGroupMode,
  roleColumnIds: string[],
): Record<KanbanColumn, Task[]> {
  if (mode === 'status' || mode === 'project') return bucketTasksByKanban(tasks, allTasks);
  if (mode === 'priority') return bucketTasksByPriority(tasks, allTasks);
  return bucketTasksByRole(tasks, allTasks, roleColumnIds);
}

/** Within one Kanban column, group tasks by enclosing project (for project group mode). */
export function groupColumnTasksByProject(
  columnTasks: Task[],
  allTasks: Task[],
  ungroupedLabel: string,
): { label: string; tasks: Task[] }[] {
  const map = new Map<string, Task[]>();
  const order: string[] = [];
  for (const t of columnTasks) {
    const proj = enclosingProject(t, allTasks);
    const key = proj?.id ?? '__none__';
    if (!map.has(key)) {
      order.push(key);
      map.set(key, []);
    }
    map.get(key)!.push(t);
  }
  const groups: { label: string; tasks: Task[] }[] = order.map((key) => {
    if (key === '__none__') {
      return { label: ungroupedLabel, tasks: map.get(key) ?? [] };
    }
    const p = allTasks.find((x) => x.id === key);
    return {
      label: p ? displayTaskTitle(p) : key,
      tasks: map.get(key) ?? [],
    };
  });
  for (const g of groups) {
    g.tasks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  groups.sort((a, b) => {
    if (a.label === ungroupedLabel && b.label !== ungroupedLabel) return 1;
    if (a.label !== ungroupedLabel && b.label === ungroupedLabel) return -1;
    return a.label.localeCompare(b.label);
  });
  return groups;
}

/** Target priority when dropping into a column (priority mode). */
export function priorityForColumn(col: KanbanColumn): number | null {
  switch (col) {
    case 'ideas':
      return 1;
    case 'planned':
      return 3;
    case 'doing':
      return 5;
    case 'finishing':
      return 7;
    case 'done_recent':
      return null;
    default:
      return 5;
  }
}

/** Target role id when dropping into a column (role mode); null = unassigned (ideas column). */
export function roleIdForColumn(col: KanbanColumn, roleColumnIds: string[]): string | null {
  if (col === 'done_recent') return null;
  const [r0, r1, r2, r3] = roleColumnIds;
  switch (col) {
    case 'ideas':
      return null;
    case 'planned':
      return r0 ?? null;
    case 'doing':
      return r1 ?? null;
    case 'finishing':
      return r2 ?? r3 ?? null;
    default:
      return null;
  }
}

/** Workflow / status column mapping (explicit `kanban_column`). */
export function buildStatusKanbanPatch(task: Task, targetCol: KanbanColumn): Partial<Task> {
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

/** Unified drop patch for DnD + keyboard column move. */
export function buildKanbanDropPatch(
  task: Task,
  targetCol: KanbanColumn,
  mode: KanbanGroupMode,
  roleColumnIds: string[],
): Partial<Task> {
  if (mode === 'status' || mode === 'project') {
    return buildStatusKanbanPatch(task, targetCol);
  }
  if (mode === 'priority') {
    if (targetCol === 'done_recent') {
      return {
        status: 'completed',
        completedAt: new Date(),
        kanbanColumn: 'done_recent',
      };
    }
    const pr = priorityForColumn(targetCol);
    if (pr == null) return {};
    const patch: Partial<Task> = {
      priority: pr,
      kanbanColumn: undefined,
    };
    if (task.status === 'completed') {
      patch.status = 'active';
      patch.completedAt = undefined;
    }
    return patch;
  }
  if (targetCol === 'done_recent') {
    return buildStatusKanbanPatch(task, targetCol);
  }
  const rid = roleIdForColumn(targetCol, roleColumnIds);
  const patch: Partial<Task> = {
    ...withTaskRoles(task, rid ? [rid] : []),
    kanbanColumn: undefined,
  };
  if (task.status === 'completed') {
    patch.status = 'active';
    patch.completedAt = undefined;
  }
  return patch;
}
