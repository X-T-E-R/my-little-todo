import type {
  KanbanColumn,
  Postponement,
  ProgressLog,
  StatusChange,
  Submission,
  Task,
  TaskPhase,
  TaskReminder,
  TaskResource,
  TaskStatus,
} from '../models/task.js';
import { taskRoleIds } from '../utils/taskRoles.js';

/** Flat row shape matching SQLite `tasks` table (snake_case columns). */
export interface TaskDbRow {
  id: string;
  title: string;
  title_customized: number;
  description: string | null;
  status: string;
  body: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  ddl: number | null;
  ddl_type: string | null;
  planned_at: number | null;
  role_id: string | null;
  /** JSON string array of role ids; when set, supersedes single role_id for multi-role tasks. */
  role_ids: string | null;
  thread_id: string | null;
  resume_text: string | null;
  pause_json: string | null;
  parent_id: string | null;
  source_stream_id: string | null;
  priority: number | null;
  promoted: number | null;
  phase: string | null;
  kanban_column: string | null;
  /** 'task' | 'project'; null/absent treated as task */
  task_type: string | null;
  tags: string;
  subtask_ids: string;
  resources: string;
  reminders: string;
  submissions: string;
  postponements: string;
  status_history: string;
  progress_logs: string;
  version: number;
  deleted_at: number | null;
}

function parseJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function reviveSubmission(raw: unknown): Submission {
  const o = raw as Record<string, unknown>;
  return {
    timestamp: new Date(String(o.timestamp ?? Date.now())),
    note: String(o.note ?? ''),
    onTime: Boolean(o.onTime),
    daysLate: o.daysLate !== undefined ? Number(o.daysLate) : undefined,
    attachment: o.attachment as Submission['attachment'],
  };
}

function revivePostponement(raw: unknown): Postponement {
  const o = raw as Record<string, unknown>;
  return {
    timestamp: new Date(String(o.timestamp ?? Date.now())),
    fromDate: new Date(String(o.fromDate ?? Date.now())),
    toDate: new Date(String(o.toDate ?? Date.now())),
    reason: String(o.reason ?? ''),
  };
}

function reviveResource(raw: unknown): TaskResource {
  const o = raw as Record<string, unknown>;
  return {
    type: (o.type as TaskResource['type']) ?? 'note',
    title: String(o.title ?? ''),
    url: o.url !== undefined ? String(o.url) : undefined,
    addedAt: new Date(String(o.addedAt ?? Date.now())),
  };
}

function reviveReminder(raw: unknown): TaskReminder {
  const o = raw as Record<string, unknown>;
  return {
    id: String(o.id ?? ''),
    time: new Date(String(o.time ?? Date.now())),
    notified: Boolean(o.notified),
    label: o.label !== undefined ? String(o.label) : undefined,
  };
}

function reviveStatusChange(raw: unknown): StatusChange {
  const o = raw as Record<string, unknown>;
  return {
    from: o.from as TaskStatus,
    to: o.to as TaskStatus,
    timestamp: new Date(String(o.timestamp ?? Date.now())),
  };
}

function reviveProgressLog(raw: unknown): ProgressLog {
  const o = raw as Record<string, unknown>;
  return {
    id: String(o.id ?? ''),
    timestamp: new Date(String(o.timestamp ?? Date.now())),
    content: String(o.content ?? ''),
    source: o.source as ProgressLog['source'],
  };
}

function reviveTaskPause(raw: unknown): Task['pause'] {
  const o = raw as Record<string, unknown>;
  const reason = String(o.reason ?? '').trim();
  if (!reason) return undefined;
  const pause: NonNullable<Task['pause']> = {
    reason,
    updatedAt: new Date(String(o.updatedAt ?? Date.now())),
  };
  const thenText = o.then != null ? String(o.then).trim() || undefined : undefined;
  if (thenText) {
    // biome-ignore lint/suspicious/noThenProperty: `pause.then` is a persisted domain field.
    pause.then = thenText;
  }
  return pause;
}

function roleFieldsFromDbRow(row: TaskDbRow): Pick<Task, 'roleId' | 'roleIds'> {
  let roleIdsParsed = row.role_ids ? parseJson<string[]>(row.role_ids, []) : [];
  if (!Array.isArray(roleIdsParsed)) roleIdsParsed = [];
  if (roleIdsParsed.length === 0 && row.role_id) {
    roleIdsParsed = [row.role_id];
  }
  const primaryRole = roleIdsParsed[0] ?? row.role_id ?? undefined;
  const multiRoles = roleIdsParsed.length > 1 ? roleIdsParsed : undefined;
  return { roleId: primaryRole, roleIds: multiRoles };
}

function parseTaskCollections(row: TaskDbRow) {
  return {
    tags: parseJson<string[]>(row.tags, []),
    subtaskIds: parseJson<string[]>(row.subtask_ids, []),
    resources: parseJson<unknown[]>(row.resources, []).map(reviveResource),
    reminders: parseJson<unknown[]>(row.reminders, []).map(reviveReminder),
    submissions: parseJson<unknown[]>(row.submissions, []).map(reviveSubmission),
    postponements: parseJson<unknown[]>(row.postponements, []).map(revivePostponement),
    statusHistory: parseJson<unknown[]>(row.status_history, []).map(reviveStatusChange),
    progressLogs: parseJson<unknown[]>(row.progress_logs, []).map(reviveProgressLog),
  };
}

function getTaskType(taskType: TaskDbRow['task_type']): Task['taskType'] {
  if (taskType === 'project' || taskType === 'task') {
    return taskType;
  }
  return undefined;
}

export function taskFromDbRow(row: TaskDbRow): Task {
  const collections = parseTaskCollections(row);

  return {
    id: row.id,
    title: row.title,
    titleCustomized: (row.title_customized ?? 0) === 1,
    description: row.description ?? undefined,
    status: row.status as TaskStatus,
    body: row.body,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at != null ? new Date(row.completed_at) : undefined,
    ddl: row.ddl != null ? new Date(row.ddl) : undefined,
    ddlType: (row.ddl_type as Task['ddlType']) ?? undefined,
    plannedAt: row.planned_at != null ? new Date(row.planned_at) : undefined,
    ...roleFieldsFromDbRow(row),
    threadId: row.thread_id ?? undefined,
    resume: row.resume_text ?? undefined,
    pause: row.pause_json ? reviveTaskPause(parseJson(row.pause_json, {})) : undefined,
    parentId: row.parent_id ?? undefined,
    sourceStreamId: row.source_stream_id ?? undefined,
    priority: row.priority ?? undefined,
    promoted: row.promoted === 1 ? true : undefined,
    phase: (row.phase as TaskPhase) ?? undefined,
    kanbanColumn: (row.kanban_column as KanbanColumn) ?? undefined,
    taskType: getTaskType(row.task_type),
    ...collections,
    progressLogs: collections.progressLogs.length > 0 ? collections.progressLogs : undefined,
  };
}

function toJson<T>(v: T): string {
  return JSON.stringify(v);
}

function serializeDate<T extends object, K extends keyof T & string>(
  value: T,
  key: K,
  date: Date,
): T {
  return {
    ...value,
    [key]: date.toISOString(),
  } as T;
}

function serializeTaskCollections(task: Task) {
  const pauseJson = (() => {
    if (!task.pause) return null;
    const payload: { reason: string; updatedAt: string; then?: string } = {
      reason: task.pause.reason,
      updatedAt: task.pause.updatedAt.toISOString(),
    };
    if (task.pause.then) {
      // biome-ignore lint/suspicious/noThenProperty: `pause.then` is a persisted domain field.
      payload.then = task.pause.then;
    }
    return toJson(payload);
  })();

  return {
    tags: toJson(task.tags),
    subtask_ids: toJson(task.subtaskIds),
    resources: toJson(
      task.resources.map((resource) => serializeDate(resource, 'addedAt', resource.addedAt)),
    ),
    reminders: toJson(
      task.reminders.map((reminder) => serializeDate(reminder, 'time', reminder.time)),
    ),
    submissions: toJson(
      task.submissions.map((submission) =>
        serializeDate(submission, 'timestamp', submission.timestamp),
      ),
    ),
    postponements: toJson(
      task.postponements.map((postponement) => ({
        ...serializeDate(postponement, 'timestamp', postponement.timestamp),
        fromDate: postponement.fromDate.toISOString(),
        toDate: postponement.toDate.toISOString(),
      })),
    ),
    status_history: toJson(
      task.statusHistory.map((statusChange) =>
        serializeDate(statusChange, 'timestamp', statusChange.timestamp),
      ),
    ),
    progress_logs: toJson(
      (task.progressLogs ?? []).map((progressLog) =>
        serializeDate(progressLog, 'timestamp', progressLog.timestamp),
      ),
    ),
    pause_json: pauseJson,
  };
}

export function taskToDbRow(task: Task, version: number, deletedAt: number | null): TaskDbRow {
  const ids = taskRoleIds(task);
  const collections = serializeTaskCollections(task);

  return {
    id: task.id,
    title: task.title,
    title_customized: task.titleCustomized ? 1 : 0,
    description: task.description ?? null,
    status: task.status,
    body: task.body,
    created_at: task.createdAt.getTime(),
    updated_at: task.updatedAt.getTime(),
    completed_at: task.completedAt?.getTime() ?? null,
    ddl: task.ddl?.getTime() ?? null,
    ddl_type: task.ddlType ?? null,
    planned_at: task.plannedAt?.getTime() ?? null,
    role_id: task.roleId ?? null,
    role_ids: ids.length > 1 ? JSON.stringify(ids) : null,
    thread_id: task.threadId ?? null,
    resume_text: task.resume ?? null,
    parent_id: task.parentId ?? null,
    source_stream_id: task.sourceStreamId ?? null,
    priority: task.priority ?? null,
    promoted: task.promoted ? 1 : null,
    phase: task.phase ?? null,
    kanban_column: task.kanbanColumn ?? null,
    task_type: task.taskType ?? null,
    ...collections,
    version,
    deleted_at: deletedAt,
  };
}
