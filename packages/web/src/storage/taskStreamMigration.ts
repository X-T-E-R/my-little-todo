import { formatDateKey, type StreamEntryDbRow, type TaskDbRow } from '@my-little-todo/core';

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

function stringifyUnique(values: string[]): string | null {
  const unique = [...new Set(values.map((item) => item.trim()).filter((item) => item.length > 0))];
  return unique.length > 0 ? JSON.stringify(unique) : null;
}

function mergeJsonArrays(...values: Array<string | null | undefined>): string {
  return JSON.stringify([
    ...new Set(values.flatMap((value) => parseJsonArray(value)).filter((item) => item.length > 0)),
  ]);
}

function primaryRoleId(task: TaskDbRow, entry?: StreamEntryDbRow): string | null {
  return parseJsonArray(task.role_ids)[0] ?? task.role_id ?? entry?.role_id ?? null;
}

function normalizedRoleIds(task: TaskDbRow, entry?: StreamEntryDbRow): string | null {
  return stringifyUnique([
    ...parseJsonArray(task.role_ids),
    task.role_id ?? '',
    entry?.role_id ?? '',
  ]);
}

function compareReusePriority(left: TaskDbRow, right: TaskDbRow): number {
  return (
    right.updated_at - left.updated_at ||
    right.created_at - left.created_at ||
    (right.title_customized ?? 0) - (left.title_customized ?? 0) ||
    (right.body?.length ?? 0) - (left.body?.length ?? 0) ||
    right.id.localeCompare(left.id)
  );
}

export interface TaskStreamMigrationResult {
  tasks: TaskDbRow[];
  streamEntries: StreamEntryDbRow[];
  taskIdMap: Record<string, string>;
  stats: {
    reusedSourceEntries: number;
    syntheticEntries: number;
    duplicateSourceGroups: number;
    orphanTasks: number;
    remappedTaskIds: number;
  };
}

export function migrateLegacyTaskStreamRows(input: {
  tasks: TaskDbRow[];
  streamEntries: StreamEntryDbRow[];
}): TaskStreamMigrationResult {
  const { tasks, streamEntries } = input;
  const streamById = new Map(streamEntries.map((entry) => [entry.id, entry] as const));
  const claimantsBySource = new Map<string, TaskDbRow[]>();

  for (const task of tasks) {
    const sourceId = task.source_stream_id;
    if (!sourceId || !streamById.has(sourceId)) continue;
    const claimants = claimantsBySource.get(sourceId) ?? [];
    claimants.push(task);
    claimantsBySource.set(sourceId, claimants);
  }

  const assignedEntryByTaskId = new Map<string, StreamEntryDbRow>();
  let duplicateSourceGroups = 0;
  for (const [sourceId, claimants] of claimantsBySource) {
    if (claimants.length > 1) duplicateSourceGroups++;
    const winner = [...claimants].sort(compareReusePriority)[0];
    const sourceEntry = streamById.get(sourceId);
    if (winner && sourceEntry) {
      assignedEntryByTaskId.set(winner.id, sourceEntry);
    }
  }

  for (const task of tasks) {
    if (assignedEntryByTaskId.has(task.id)) continue;
    const sameIdEntry = streamById.get(task.id);
    if (sameIdEntry) {
      assignedEntryByTaskId.set(task.id, sameIdEntry);
    }
  }

  const taskIdMap: Record<string, string> = {};
  const migratedTasksBase = tasks.map((task) => {
    const assignedEntry = assignedEntryByTaskId.get(task.id);
    const nextId = assignedEntry?.id ?? task.id;
    taskIdMap[task.id] = nextId;
    return { task, assignedEntry, nextId };
  });

  const migratedTasks = migratedTasksBase.map(({ task, assignedEntry, nextId }) => {
    const nextCreatedAt = assignedEntry?.timestamp ?? task.created_at;
    const nextUpdatedAt = Math.max(
      task.updated_at,
      assignedEntry?.updated_at ?? assignedEntry?.timestamp ?? 0,
    );
    return {
      ...task,
      id: nextId,
      body: '',
      created_at: nextCreatedAt,
      updated_at: nextUpdatedAt,
      role_id: null,
      role_ids: normalizedRoleIds(task, assignedEntry),
      parent_id: task.parent_id ? (taskIdMap[task.parent_id] ?? task.parent_id) : null,
      source_stream_id: null,
      tags: mergeJsonArrays(task.tags, assignedEntry?.tags),
      subtask_ids: JSON.stringify(
        parseJsonArray(task.subtask_ids).map((subtaskId) => taskIdMap[subtaskId] ?? subtaskId),
      ),
    };
  });

  const migratedTaskIds = new Set(migratedTasks.map((task) => task.id));
  const assignedEntryIds = new Set(
    migratedTasksBase
      .map(({ assignedEntry }) => assignedEntry?.id)
      .filter((id): id is string => Boolean(id)),
  );

  const taskEntries = migratedTasksBase.map(({ task, assignedEntry, nextId }) => {
    const nextContent = task.body || assignedEntry?.content || '';
    const nextTimestamp = assignedEntry?.timestamp ?? task.created_at;
    const nextUpdatedAt = Math.max(
      task.updated_at,
      assignedEntry?.updated_at ?? assignedEntry?.timestamp ?? 0,
    );
    return {
      ...(assignedEntry ?? {
        id: nextId,
        content: '',
        entry_type: 'task',
        timestamp: nextTimestamp,
        date_key: formatDateKey(new Date(nextTimestamp)),
        role_id: null,
        extracted_task_id: null,
        tags: '[]',
        attachments: '[]',
        version: task.version,
        deleted_at: null,
        updated_at: nextUpdatedAt,
      }),
      id: nextId,
      content: nextContent,
      entry_type: 'task',
      date_key: formatDateKey(new Date(nextTimestamp)),
      role_id: primaryRoleId(task, assignedEntry),
      extracted_task_id: null,
      tags: mergeJsonArrays(task.tags, assignedEntry?.tags),
      updated_at: nextUpdatedAt,
    } satisfies StreamEntryDbRow;
  });

  const preservedEntries = streamEntries
    .filter((entry) => !assignedEntryIds.has(entry.id) && !migratedTaskIds.has(entry.id))
    .map((entry) => ({
      ...entry,
      extracted_task_id: null,
    }));

  return {
    tasks: migratedTasks,
    streamEntries: [...preservedEntries, ...taskEntries],
    taskIdMap,
    stats: {
      reusedSourceEntries: migratedTasksBase.filter(({ assignedEntry }) => Boolean(assignedEntry))
        .length,
      syntheticEntries: migratedTasksBase.filter(({ assignedEntry }) => !assignedEntry).length,
      duplicateSourceGroups,
      orphanTasks: migratedTasksBase.filter(
        ({ task, assignedEntry }) =>
          !assignedEntry && (!task.source_stream_id || !streamById.has(task.source_stream_id)),
      ).length,
      remappedTaskIds: migratedTasksBase.filter(({ task, nextId }) => task.id !== nextId).length,
    },
  };
}
