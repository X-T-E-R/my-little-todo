import type { Task, TaskStatus } from '@my-little-todo/core';
import { taskId, taskRoleIds, withTaskRoles } from '@my-little-todo/core';
import { getDataStore } from './dataStore';

export async function loadAllTasks(): Promise<Task[]> {
  return getDataStore().getAllTasks();
}

export async function loadTask(id: string): Promise<Task | null> {
  return getDataStore().getTask(id);
}

export async function saveTask(task: Task): Promise<void> {
  task.updatedAt = new Date();
  await getDataStore().putTask(task);
}

export async function createTask(
  title: string,
  opts?: {
    description?: string;
    ddl?: Date;
    ddlType?: Task['ddlType'];
    tags?: string[];
    sourceStreamId?: string;
    roleId?: string;
    roleIds?: string[];
    body?: string;
    parentId?: string;
    /** When set, overrides inference from non-empty `title`. */
    titleCustomized?: boolean;
  },
): Promise<Task> {
  const now = new Date();
  const trimmedTitle = title.trim();
  const inferredCustom = trimmedTitle.length > 0;
  const task: Task = {
    id: taskId(),
    title: trimmedTitle,
    titleCustomized: opts?.titleCustomized ?? inferredCustom,
    description: opts?.description,
    status: 'inbox',
    createdAt: now,
    updatedAt: now,
    ddl: opts?.ddl,
    ddlType: opts?.ddlType,
    tags: opts?.tags ?? [],
    body: opts?.body ?? '',
    subtaskIds: [],
    parentId: opts?.parentId,
    sourceStreamId: opts?.sourceStreamId,
    roleId: opts?.roleId,
    roleIds: opts?.roleIds,
    resources: [],
    reminders: [],
    submissions: [],
    postponements: [],
    statusHistory: [{ from: 'inbox' as const, to: 'inbox' as const, timestamp: now }],
    phase: 'understood',
    progressLogs: [],
  };
  await saveTask(task);
  return task;
}

export async function deleteTask(id: string): Promise<void> {
  await getDataStore().deleteTask(id);
}

export async function addSubtask(parentId: string, title: string): Promise<Task | null> {
  const parent = await loadTask(parentId);
  if (!parent) return null;

  const child = await createTask(title, {
    parentId,
    ...withTaskRoles(parent, taskRoleIds(parent)),
  });

  parent.subtaskIds.push(child.id);
  await saveTask(parent);

  return child;
}

export async function extractSubtask(subtaskId: string): Promise<Task | null> {
  const child = await loadTask(subtaskId);
  if (!child || !child.parentId) return null;

  const parent = await loadTask(child.parentId);
  if (parent) {
    parent.subtaskIds = parent.subtaskIds.filter((id) => id !== subtaskId);
    await saveTask(parent);
  }

  child.parentId = undefined;
  await saveTask(child);
  return child;
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<Task | null> {
  const task = await loadTask(id);
  if (!task) return null;
  const now = new Date();
  const prevStatus = task.status;
  task.status = status;
  if (status === 'completed') {
    task.completedAt = now;
    if (task.parentId) task.promoted = undefined;
  } else {
    task.completedAt = undefined;
  }
  if (!task.statusHistory) task.statusHistory = [];
  task.statusHistory.push({ from: prevStatus, to: status, timestamp: now });
  await saveTask(task);
  return task;
}

export async function postponeTask(
  id: string,
  reason: string,
  newDate: Date,
): Promise<Task | null> {
  const task = await loadTask(id);
  if (!task || !task.ddl) return null;

  task.postponements.push({
    timestamp: new Date(),
    fromDate: task.ddl,
    toDate: newDate,
    reason,
  });
  task.ddl = newDate;
  await saveTask(task);
  return task;
}

export async function submitTask(id: string, note: string): Promise<Task | null> {
  const task = await loadTask(id);
  if (!task) return null;

  const now = new Date();
  const onTime = task.ddl ? task.ddl.getTime() >= now.getTime() : true;
  const daysLate =
    task.ddl && !onTime ? Math.ceil((now.getTime() - task.ddl.getTime()) / 86400000) : undefined;

  task.submissions.push({ timestamp: now, note, onTime, daysLate });
  task.status = 'completed';
  task.completedAt = now;
  await saveTask(task);
  return task;
}
