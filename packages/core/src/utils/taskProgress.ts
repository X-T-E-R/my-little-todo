import type { Task, TaskPhase } from '../models/task.js';

/** Order used for Goal Gradient / recommendation weighting. */
export const TASK_PHASE_ORDER: TaskPhase[] = [
  'understood',
  'exploring',
  'working',
  'core_done',
  'wrapping_up',
];

export function phaseIndex(phase: TaskPhase | undefined): number {
  if (!phase) return -1;
  const i = TASK_PHASE_ORDER.indexOf(phase);
  return i >= 0 ? i : -1;
}

/** 0–1 approximate progress from phase + subtask completion. */
export function estimateTaskProgress(task: Task, allTasks: Task[]): number {
  const phase = task.phase;
  let base = 0;
  if (phase) {
    const idx = TASK_PHASE_ORDER.indexOf(phase);
    base = idx >= 0 ? (idx + 1) / (TASK_PHASE_ORDER.length + 1) : 0;
  }
  const subs = (task.subtaskIds ?? [])
    .map((id) => allTasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined);
  if (subs.length > 0) {
    const done = subs.filter((s) => s.status === 'completed').length;
    const subRatio = done / subs.length;
    return Math.min(1, Math.max(base, subRatio * 0.9 + base * 0.1));
  }
  const logs = task.progressLogs?.length ?? 0;
  if (logs > 0) {
    return Math.min(1, base + Math.min(0.15, logs * 0.03));
  }
  return base;
}

export function isNearFinishing(task: Task, allTasks: Task[]): boolean {
  if (task.phase === 'core_done' || task.phase === 'wrapping_up') return true;
  return estimateTaskProgress(task, allTasks) >= 0.7;
}

export function isSmallTask(task: Task): boolean {
  const subs = task.subtaskIds?.length ?? 0;
  const bodyLen = (task.body ?? '').trim().length;
  return subs === 0 && bodyLen < 200 && (task.title?.length ?? 0) < 80;
}

export function nextPhase(current: TaskPhase | undefined): TaskPhase | undefined {
  if (!current) return 'understood';
  const i = TASK_PHASE_ORDER.indexOf(current);
  if (i < 0 || i >= TASK_PHASE_ORDER.length - 1) return undefined;
  return TASK_PHASE_ORDER[i + 1];
}
