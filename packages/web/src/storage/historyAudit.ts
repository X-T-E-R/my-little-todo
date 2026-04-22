import type { HistoryEntityType } from './dataStore';

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseValueArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function createHistoryGroupId(): string {
  return crypto.randomUUID();
}

export function isSensitiveSettingHistoryKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return [
    'token',
    'password',
    'secret',
    'api-key',
    'api_key',
    'apikey',
    'credential',
    'cookie',
  ].some((needle) => normalized.includes(needle));
}

export function sanitizeSettingHistorySnapshot(
  key: string,
  value: string,
  meta: { deletedAt: number | null; updatedAt: number; version: number },
): Record<string, unknown> {
  if (!isSensitiveSettingHistoryKey(key)) {
    return {
      key,
      value,
      updated_at: meta.updatedAt,
      version: meta.version,
      deleted_at: meta.deletedAt,
    };
  }
  return {
    key,
    value_redacted: true,
    value_length: value.length,
    updated_at: meta.updatedAt,
    version: meta.version,
    deleted_at: meta.deletedAt,
  };
}

export function hydrateTaskSnapshotFromRawHistory(
  taskSnapshotJson: string,
  streamSnapshotJson: string | null,
): string {
  const task = JSON.parse(taskSnapshotJson) as Record<string, unknown>;
  const stream = streamSnapshotJson
    ? (JSON.parse(streamSnapshotJson) as Record<string, unknown>)
    : null;
  const roleIds = uniqueStrings([
    ...parseStringArray(task.role_ids),
    ...(typeof task.role_id === 'string' ? [task.role_id] : []),
    ...(stream && typeof stream.role_id === 'string' ? [stream.role_id] : []),
  ]);
  const tags = uniqueStrings([
    ...parseStringArray(task.tags),
    ...(stream ? parseStringArray(stream.tags) : []),
  ]);
  const createdAt =
    stream && typeof stream.timestamp === 'number'
      ? stream.timestamp
      : Number(task.created_at ?? 0);
  const updatedAt = Math.max(
    Number(task.updated_at ?? 0),
    stream ? Number(stream.updated_at ?? stream.timestamp ?? 0) : 0,
  );
  const snapshot = {
    id: String(task.id ?? ''),
    title: String(task.title ?? ''),
    title_customized: Number(task.title_customized ?? 0),
    description: task.description ?? null,
    status: String(task.status ?? 'inbox'),
    body:
      stream && typeof stream.content === 'string' ? stream.content : String(task.body ?? ''),
    created_at: createdAt,
    updated_at: updatedAt,
    completed_at: task.completed_at ?? null,
    ddl: task.ddl ?? null,
    ddl_type: task.ddl_type ?? null,
    planned_at: task.planned_at ?? null,
    thread_id: task.thread_id ?? null,
    resume_text: task.resume_text ?? null,
    pause_json: task.pause_json ?? null,
    role_ids: roleIds,
    primary_role: roleIds[0] ?? null,
    tags,
    parent_id: task.parent_id ?? null,
    subtask_ids: parseStringArray(task.subtask_ids),
    task_type: task.task_type ?? 'task',
    priority: task.priority ?? null,
    promoted: task.promoted ?? null,
    phase: task.phase ?? null,
    kanban_column: task.kanban_column ?? null,
    resources: parseValueArray(task.resources),
    reminders: parseValueArray(task.reminders),
    submissions: parseValueArray(task.submissions),
    postponements: parseValueArray(task.postponements),
    status_history: parseValueArray(task.status_history),
    progress_logs: parseValueArray(task.progress_logs),
    version: Number(task.version ?? 0),
    deleted_at: task.deleted_at ?? null,
  };
  return JSON.stringify(snapshot);
}

export function buildHistorySummary(entityType: HistoryEntityType, snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const record = snapshot as Record<string, unknown>;
  switch (entityType) {
    case 'tasks':
      return JSON.stringify({
        title: String(record.title ?? ''),
        status: String(record.status ?? ''),
      });
    case 'stream_entries':
      return JSON.stringify({
        entry_type: String(record.entry_type ?? record.entryType ?? 'spark'),
        content_length: String(record.content ?? '').length,
      });
    case 'settings':
      return JSON.stringify({
        key: String(record.key ?? ''),
        sensitive: Boolean(record.value_redacted),
        value_length:
          typeof record.value_length === 'number'
            ? record.value_length
            : String(record.value ?? '').length,
      });
    case 'blobs':
      return JSON.stringify({
        filename: String(record.filename ?? ''),
        size: Number(record.size ?? 0),
      });
    case 'work_threads':
      return JSON.stringify({
        title: String(record.title ?? ''),
        status: String(record.status ?? ''),
      });
    default:
      return null;
  }
}
