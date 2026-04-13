import type { Task } from '../models/task.js';

function taskByIdMap(tasks: Task[]): Map<string, Task> {
  return new Map(tasks.map((t) => [t.id, t]));
}

/**
 * Walk `parentId` chain and return the nearest ancestor with `taskType === 'project'`, or null.
 */
export function enclosingProjectId(task: Task, allTasks: Task[]): string | null {
  const map = taskByIdMap(allTasks);
  const seen = new Set<string>();
  let cur: Task | undefined = task;
  while (cur?.parentId) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    const p = map.get(cur.parentId);
    if (!p) break;
    if (p.taskType === 'project') return p.id;
    cur = p;
  }
  return null;
}

/** The project task that contains this task, if any. */
export function enclosingProject(task: Task, allTasks: Task[]): Task | null {
  const id = enclosingProjectId(task, allTasks);
  if (!id) return null;
  return allTasks.find((t) => t.id === id) ?? null;
}

/** All tasks that belong to a project tree (the project root and every descendant). */
export function collectProjectSubtree(project: Task, allTasks: Task[]): Task[] {
  if (project.taskType !== 'project') return [];
  const map = taskByIdMap(allTasks);
  const out: Task[] = [];
  const stack = [project.id];
  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    const t = map.get(id);
    if (!t) continue;
    out.push(t);
    for (const sid of t.subtaskIds ?? []) {
      stack.push(sid);
    }
  }
  return out;
}

/** Progress of direct children only (for display). */
export function projectDirectChildProgress(
  project: Task,
  allTasks: Task[],
): {
  total: number;
  completed: number;
} {
  const map = taskByIdMap(allTasks);
  const ids = project.subtaskIds ?? [];
  let completed = 0;
  for (const id of ids) {
    const c = map.get(id);
    if (c?.status === 'completed') completed++;
  }
  return { total: ids.length, completed };
}

/** Progress across all descendants (excluding the project root itself). */
export function projectDescendantProgress(
  project: Task,
  allTasks: Task[],
): {
  total: number;
  completed: number;
} {
  const subtree = collectProjectSubtree(project, allTasks).filter((t) => t.id !== project.id);
  const completed = subtree.filter((t) => t.status === 'completed').length;
  return { total: subtree.length, completed };
}
