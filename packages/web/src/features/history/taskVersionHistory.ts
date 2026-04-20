import type { AuditEventRecord, EntityRevisionRecord } from '../../storage/dataStore';

export type TaskHistoryFieldKey =
  | 'title'
  | 'status'
  | 'body'
  | 'plannedAt'
  | 'ddl'
  | 'roles'
  | 'tags'
  | 'phase'
  | 'taskType'
  | 'parentId'
  | 'subtaskCount'
  | 'reminderCount'
  | 'resourceCount'
  | 'deletedAt';

export interface TaskHistorySnapshot {
  title: string;
  status: string;
  body: string;
  plannedAt: number | null;
  ddl: number | null;
  roles: string[];
  tags: string[];
  phase: string | null;
  taskType: string | null;
  parentId: string | null;
  subtaskCount: number;
  reminderCount: number;
  resourceCount: number;
  deletedAt: string | number | null;
}

export interface TaskHistoryDiffEntry {
  field: TaskHistoryFieldKey;
  beforeValue: string | number | string[] | null;
  afterValue: string | number | string[] | null;
}

export interface TaskHistoryItem {
  revision: EntityRevisionRecord;
  event: AuditEventRecord | null;
  snapshot: TaskHistorySnapshot | null;
  changes: TaskHistoryDiffEntry[];
}

const FIELD_ORDER: TaskHistoryFieldKey[] = [
  'title',
  'status',
  'body',
  'plannedAt',
  'ddl',
  'roles',
  'tags',
  'phase',
  'taskType',
  'parentId',
  'subtaskCount',
  'reminderCount',
  'resourceCount',
  'deletedAt',
];

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function parseCountArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeNullableTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseTaskHistorySnapshot(snapshotJson: string): TaskHistorySnapshot | null {
  try {
    const raw = JSON.parse(snapshotJson) as Record<string, unknown>;
    return {
      title: typeof raw.title === 'string' ? raw.title : '',
      status: typeof raw.status === 'string' ? raw.status : 'inbox',
      body: typeof raw.body === 'string' ? raw.body : '',
      plannedAt: normalizeNullableTimestamp(raw.planned_at),
      ddl: normalizeNullableTimestamp(raw.ddl),
      roles: parseStringArray(raw.role_ids),
      tags: parseStringArray(raw.tags),
      phase: normalizeNullableString(raw.phase),
      taskType: normalizeNullableString(raw.task_type),
      parentId: normalizeNullableString(raw.parent_id),
      subtaskCount: parseCountArray(raw.subtask_ids).length,
      reminderCount: parseCountArray(raw.reminders).length,
      resourceCount: parseCountArray(raw.resources).length,
      deletedAt:
        typeof raw.deleted_at === 'string' || typeof raw.deleted_at === 'number'
          ? raw.deleted_at
          : null,
    };
  } catch {
    return null;
  }
}

function isEqualValue(
  left: string | number | string[] | null,
  right: string | number | string[] | null,
): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
  }
  return left === right;
}

function fieldValue(
  snapshot: TaskHistorySnapshot,
  field: TaskHistoryFieldKey,
): string | number | string[] | null {
  switch (field) {
    case 'title':
      return snapshot.title;
    case 'status':
      return snapshot.status;
    case 'body':
      return snapshot.body;
    case 'plannedAt':
      return snapshot.plannedAt;
    case 'ddl':
      return snapshot.ddl;
    case 'roles':
      return snapshot.roles;
    case 'tags':
      return snapshot.tags;
    case 'phase':
      return snapshot.phase;
    case 'taskType':
      return snapshot.taskType;
    case 'parentId':
      return snapshot.parentId;
    case 'subtaskCount':
      return snapshot.subtaskCount;
    case 'reminderCount':
      return snapshot.reminderCount;
    case 'resourceCount':
      return snapshot.resourceCount;
    case 'deletedAt':
      return snapshot.deletedAt;
  }
}

export function diffTaskHistorySnapshots(
  current: TaskHistorySnapshot | null,
  previous: TaskHistorySnapshot | null,
): TaskHistoryDiffEntry[] {
  if (!current) return [];
  return FIELD_ORDER.flatMap((field) => {
    const afterValue = fieldValue(current, field);
    const beforeValue = previous ? fieldValue(previous, field) : null;
    if (previous && isEqualValue(beforeValue, afterValue)) {
      return [];
    }
    if (!previous) {
      if (
        afterValue == null ||
        afterValue === '' ||
        (Array.isArray(afterValue) && afterValue.length === 0) ||
        afterValue === 0
      ) {
        return [];
      }
    }
    return [{ field, beforeValue, afterValue }];
  });
}

function matchRevisionEvent(
  revision: EntityRevisionRecord,
  events: AuditEventRecord[],
): AuditEventRecord | null {
  return (
    events.find((event) =>
      revision.groupId
        ? event.groupId === revision.groupId
        : event.globalVersion === revision.globalVersion ||
          event.entityVersion === revision.entityVersion,
    ) ?? null
  );
}

export function buildTaskHistoryItems(
  revisions: EntityRevisionRecord[],
  events: AuditEventRecord[],
): TaskHistoryItem[] {
  return revisions.map((revision, index) => {
    const snapshot = parseTaskHistorySnapshot(revision.snapshotJson);
    const previousSnapshot = parseTaskHistorySnapshot(revisions[index + 1]?.snapshotJson ?? '');
    return {
      revision,
      event: matchRevisionEvent(revision, events),
      snapshot,
      changes: diffTaskHistorySnapshots(snapshot, previousSnapshot),
    };
  });
}

function shortenText(value: string, maxLength = 96): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

export function formatTaskHistoryValue(
  field: TaskHistoryFieldKey,
  value: string | number | string[] | null,
): string {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—';
  switch (field) {
    case 'body':
      return shortenText(String(value), 120);
    case 'plannedAt':
    case 'ddl':
      return typeof value === 'number' ? new Date(value).toLocaleString() : String(value);
    case 'deletedAt':
      return typeof value === 'number' ? new Date(value).toLocaleString() : String(value);
    default:
      return String(value);
  }
}

export function formatHistoryActorLabel(event: AuditEventRecord | null): string | null {
  if (!event) return null;
  if (event.actorType === 'local-user' || event.actorType === 'user') {
    return event.actorId;
  }
  return `${event.actorType}:${event.actorId}`;
}
