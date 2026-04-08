import type { Task } from '../models/task.js';

/** Effective role id list for filtering and display. */
export function taskRoleIds(task: Pick<Task, 'roleId' | 'roleIds'>): string[] {
  if (task.roleIds?.length) return [...new Set(task.roleIds)];
  if (task.roleId) return [task.roleId];
  return [];
}

/** Merge single- or multi-role updates into a consistent Task patch. */
export function withTaskRoles(
  task: Task,
  roleIds: string[] | undefined,
): Pick<Task, 'roleId' | 'roleIds'> {
  const cleaned = [...new Set((roleIds ?? []).filter(Boolean))];
  if (cleaned.length === 0) return { roleId: undefined, roleIds: undefined };
  if (cleaned.length === 1) return { roleId: cleaned[0], roleIds: undefined };
  return { roleId: cleaned[0], roleIds: cleaned };
}
