import type { StreamEntryDbRow, TaskDbRow } from '@my-little-todo/core';
import { describe, expect, it } from 'vitest';
import { type BackupPayload, importPayloadToStore } from '../utils/backupPayload';
import fixture from './__fixtures__/legacy-task-stream-v053-slice.json';
import { migrateLegacyTaskStreamRows } from './taskStreamMigration';

function parseRows<T>(rows: string[]): T[] {
  return rows.map((row) => JSON.parse(row) as T);
}

describe('migrateLegacyTaskStreamRows', () => {
  it('normalizes duplicate sources, orphan tasks, and parent remapping from the v0.5.3 backup slice', () => {
    const result = migrateLegacyTaskStreamRows({
      tasks: parseRows<TaskDbRow>(fixture.tasks),
      streamEntries: parseRows<StreamEntryDbRow>(fixture.stream_entries),
    });

    expect(result.stats.duplicateSourceGroups).toBe(1);
    expect(result.stats.orphanTasks).toBe(2);
    expect(result.stats.remappedTaskIds).toBe(2);

    const winner = result.tasks.find((task) => task.id === 'se-20260402-101021');
    expect(winner?.body).toBe('');
    expect(winner?.role_id).toBeNull();
    expect(winner?.source_stream_id).toBeNull();
    expect(winner?.role_ids).toBe(JSON.stringify(['role-mn1o2z7q-1']));

    const loser = result.tasks.find((task) => task.id === 't-20260410-141208239');
    expect(loser).toBeTruthy();

    const parent = result.tasks.find((task) => task.id === 'se-20260324-194332');
    const child = result.tasks.find((task) => task.id === 't-20260324-115638915');
    expect(parent?.subtask_ids).toBe(JSON.stringify(['t-20260324-115638915']));
    expect(child?.parent_id).toBe('se-20260324-194332');

    const canonicalEntry = result.streamEntries.find((entry) => entry.id === 'se-20260402-101021');
    expect(canonicalEntry?.extracted_task_id).toBeNull();
    expect(canonicalEntry?.entry_type).toBe('task');

    const syntheticLoserEntry = result.streamEntries.find(
      (entry) => entry.id === 't-20260410-141208239',
    );
    expect(syntheticLoserEntry?.content).toBe('发布 mlt 和 zotero');

    const syntheticOrphanEntry = result.streamEntries.find(
      (entry) => entry.id === 't-20260413-103214381',
    );
    expect(syntheticOrphanEntry?.content).toBe('');
  });

  it('deduplicates legacy backup imports through importPayloadToStore', async () => {
    const restored = {
      tasks: [] as TaskDbRow[],
      streamEntries: [] as StreamEntryDbRow[],
      settings: [] as [string, string][],
    };

    await importPayloadToStore(
      {
        putTask: async (task) => {
          restored.tasks.push({
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
            role_ids: task.roleIds ? JSON.stringify(task.roleIds) : null,
            thread_id: task.threadId ?? null,
            resume_text: task.resume ?? null,
            pause_json: task.pause
              ? (() => {
                  const pauseJson: { reason: string; updatedAt: string; then?: string } = {
                    reason: task.pause.reason,
                    updatedAt: task.pause.updatedAt.toISOString(),
                  };
                  if (task.pause.then) {
                    // biome-ignore lint/suspicious/noThenProperty: Test payload mirrors persisted field names.
                    pauseJson.then = task.pause.then;
                  }
                  return JSON.stringify(pauseJson);
                })()
              : null,
            parent_id: task.parentId ?? null,
            source_stream_id: task.sourceStreamId ?? null,
            priority: task.priority ?? null,
            promoted: task.promoted ? 1 : null,
            phase: task.phase ?? null,
            kanban_column: task.kanbanColumn ?? null,
            task_type: task.taskType ?? null,
            tags: JSON.stringify(task.tags),
            subtask_ids: JSON.stringify(task.subtaskIds),
            resources: JSON.stringify(task.resources),
            reminders: JSON.stringify(task.reminders),
            submissions: JSON.stringify(task.submissions),
            postponements: JSON.stringify(task.postponements),
            status_history: JSON.stringify(task.statusHistory),
            progress_logs: JSON.stringify(task.progressLogs ?? []),
            version: 0,
            deleted_at: null,
          });
        },
        putStreamEntry: async (entry) => {
          restored.streamEntries.push({
            id: entry.id,
            content: entry.content,
            entry_type: entry.entryType,
            timestamp: entry.timestamp.getTime(),
            date_key: '',
            role_id: entry.roleId ?? null,
            extracted_task_id: entry.extractedTaskId ?? null,
            tags: JSON.stringify(entry.tags),
            attachments: JSON.stringify(entry.attachments),
            version: 0,
            deleted_at: null,
            updated_at: entry.timestamp.getTime(),
          });
        },
        putSetting: async (key, value) => {
          restored.settings.push([key, value]);
        },
      },
      fixture as BackupPayload,
    );

    expect(restored.tasks.some((task) => task.id === 'se-20260402-101021')).toBe(true);
    expect(restored.tasks.some((task) => task.id === 't-20260413-003338622')).toBe(false);
    expect(restored.streamEntries.some((entry) => entry.id === 't-20260410-141208239')).toBe(true);
    expect(restored.streamEntries.some((entry) => entry.id === 't-20260413-003338622')).toBe(false);
  });
});
