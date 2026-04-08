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
  parent_id: string | null;
  source_stream_id: string | null;
  priority: number | null;
  promoted: number | null;
  phase: string | null;
  kanban_column: string | null;
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

export function taskFromDbRow(row: TaskDbRow): Task {
  const tags = parseJson<string[]>(row.tags, []);
  const subtaskIds = parseJson<string[]>(row.subtask_ids, []);
  const resources = parseJson<unknown[]>(row.resources, []).map(reviveResource);
  const reminders = parseJson<unknown[]>(row.reminders, []).map(reviveReminder);
  const submissions = parseJson<unknown[]>(row.submissions, []).map(reviveSubmission);
  const postponements = parseJson<unknown[]>(row.postponements, []).map(revivePostponement);
  const statusHistory = parseJson<unknown[]>(row.status_history, []).map(reviveStatusChange);
  const progressLogs = parseJson<unknown[]>(row.progress_logs, []).map(reviveProgressLog);

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
    parentId: row.parent_id ?? undefined,
    sourceStreamId: row.source_stream_id ?? undefined,
    priority: row.priority ?? undefined,
    promoted: row.promoted === 1 ? true : undefined,
    phase: (row.phase as TaskPhase) ?? undefined,
    kanbanColumn: (row.kanban_column as KanbanColumn) ?? undefined,
    tags,
    subtaskIds,
    resources,
    reminders,
    submissions,
    postponements,
    statusHistory,
    progressLogs: progressLogs.length > 0 ? progressLogs : undefined,
  };
}

function toJson<T>(v: T): string {
  return JSON.stringify(v);
}

export function taskToDbRow(task: Task, version: number, deletedAt: number | null): TaskDbRow {
  const ids = taskRoleIds(task);
  const roleIdsJson = ids.length > 1 ? JSON.stringify(ids) : null;

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
    role_ids: roleIdsJson,
    parent_id: task.parentId ?? null,
    source_stream_id: task.sourceStreamId ?? null,
    priority: task.priority ?? null,
    promoted: task.promoted ? 1 : null,
    phase: task.phase ?? null,
    kanban_column: task.kanbanColumn ?? null,
    tags: toJson(task.tags),
    subtask_ids: toJson(task.subtaskIds),
    resources: toJson(
      task.resources.map((r) => ({
        ...r,
        addedAt: r.addedAt.toISOString(),
      })),
    ),
    reminders: toJson(
      task.reminders.map((r) => ({
        ...r,
        time: r.time.toISOString(),
      })),
    ),
    submissions: toJson(
      task.submissions.map((s) => ({
        ...s,
        timestamp: s.timestamp.toISOString(),
      })),
    ),
    postponements: toJson(
      task.postponements.map((p) => ({
        ...p,
        timestamp: p.timestamp.toISOString(),
        fromDate: p.fromDate.toISOString(),
        toDate: p.toDate.toISOString(),
      })),
    ),
    status_history: toJson(
      task.statusHistory.map((s) => ({
        ...s,
        timestamp: s.timestamp.toISOString(),
      })),
    ),
    progress_logs: toJson(
      (task.progressLogs ?? []).map((p) => ({
        ...p,
        timestamp: p.timestamp.toISOString(),
      })),
    ),
    version,
    deleted_at: deletedAt,
  };
}
