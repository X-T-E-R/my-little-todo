import type { StreamEntry, Task } from '@my-little-todo/core';

function unique(ids: Array<string | undefined | null>): string[] {
  return [...new Set(ids.map((id) => id?.trim()).filter((id): id is string => Boolean(id)))];
}

export function normalizeTaskRoleIds(
  task: Pick<Task, 'roleIds' | 'roleId'>,
  fallbackRoleId?: string,
): string[] {
  return unique([...(task.roleIds ?? []), task.roleId, fallbackRoleId]);
}

export function getPrimaryRoleId(
  task: Pick<Task, 'roleIds' | 'roleId'>,
  fallbackRoleId?: string,
): string | undefined {
  return normalizeTaskRoleIds(task, fallbackRoleId)[0];
}

export function mergeTaskTags(task: Pick<Task, 'tags'>, entry?: Pick<StreamEntry, 'tags'>): string[] {
  return unique([...(entry?.tags ?? []), ...(task.tags ?? [])]);
}

export function hydrateTaskWithEntry(task: Task, entry?: StreamEntry): Task {
  const roleIds = normalizeTaskRoleIds(task, entry?.roleId);
  const primaryRoleId = roleIds[0];
  const body = entry?.content ?? task.body;
  const createdAt = entry?.timestamp ?? task.createdAt;
  const entryUpdatedAt = entry?.timestamp ?? createdAt;
  const updatedAt =
    entry && entryUpdatedAt.getTime() > task.updatedAt.getTime() ? entryUpdatedAt : task.updatedAt;

  return {
    ...task,
    body,
    createdAt,
    updatedAt,
    roleId: primaryRoleId,
    roleIds: roleIds.length > 0 ? roleIds : undefined,
    sourceStreamId: entry?.id ?? task.sourceStreamId,
    tags: mergeTaskTags(task, entry),
  };
}

export function deriveTaskFacetFromEntry(task: Task, entry?: StreamEntry): Task {
  const roleIds = normalizeTaskRoleIds(task, entry?.roleId);
  return {
    ...task,
    roleId: undefined,
    roleIds: roleIds.length > 0 ? roleIds : undefined,
    sourceStreamId: undefined,
    body: entry?.content ?? task.body,
    createdAt: entry?.timestamp ?? task.createdAt,
  };
}

export function shouldProjectStreamRoleToTask(task: Pick<Task, 'roleIds'>): boolean {
  return (task.roleIds?.length ?? 0) <= 1;
}
