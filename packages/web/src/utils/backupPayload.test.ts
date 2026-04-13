import type { StreamEntry, Task } from '@my-little-todo/core';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  buildBackupPayload,
  importPayloadToStore,
  isLegacyBackupPayload,
  parseImportPayload,
} from './backupPayload';

function createTask(): Task {
  const now = new Date('2026-04-13T10:00:00.000Z');
  return {
    id: 'task-1',
    title: 'Prepare release',
    titleCustomized: true,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    tags: ['release', 'stable'],
    body: 'Make sure backup restore still works.',
    subtaskIds: [],
    resources: [],
    reminders: [],
    submissions: [],
    postponements: [],
    statusHistory: [],
  };
}

function createStreamEntry(): StreamEntry {
  return {
    id: 'task-1',
    content: 'Verify backup import before release',
    timestamp: new Date('2026-04-13T11:00:00.000Z'),
    tags: ['release'],
    attachments: [],
    extractedTaskId: 'task-1',
    entryType: 'task',
  };
}

describe('backupPayload', () => {
  it('builds the stable backup contract with required metadata', () => {
    const payload = buildBackupPayload({
      tasks: [createTask()],
      streamEntries: [createStreamEntry()],
      settings: { theme: 'system', locale: 'zh-CN' },
      platform: 'tauri',
    });

    expect(payload.kind).toBe('my-little-todo-backup');
    expect(payload.schema_version).toBe(1);
    expect(payload.export_version).toBe(3);
    expect(payload.platform).toBe('tauri');
    expect(payload.includes_blobs).toBe(false);
    expect(payload.tasks).toHaveLength(1);
    expect(payload.stream_entries).toHaveLength(1);
    expect(payload.settings).toEqual([
      ['theme', 'system'],
      ['locale', 'zh-CN'],
    ]);
    expect(payload.blobs).toEqual([]);

    const taskRow = JSON.parse(payload.tasks?.[0] ?? '{}') as Record<string, unknown>;
    expect(taskRow.body).toBe('');
    expect(taskRow.role_id).toBeNull();
    expect(taskRow.source_stream_id).toBeNull();

    const streamRow = JSON.parse(payload.stream_entries?.[0] ?? '{}') as Record<string, unknown>;
    expect(streamRow.extracted_task_id).toBeNull();
  });

  it('parses both plain json and zipped export payloads', async () => {
    const payload = buildBackupPayload({
      tasks: [createTask()],
      streamEntries: [createStreamEntry()],
      settings: { sync: 'webdav' },
      platform: 'web-hosted',
    });

    const jsonFile = new File([JSON.stringify(payload)], 'backup.json', {
      type: 'application/json',
    });
    const parsedJson = await parseImportPayload(jsonFile);
    expect(parsedJson.tasks).toHaveLength(1);
    expect(parsedJson.settings).toEqual([['sync', 'webdav']]);

    const zip = new JSZip();
    zip.file('export.json', JSON.stringify(payload));
    zip.file('_meta.json', JSON.stringify({ version: '0.5.3' }));
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipFile = new File([zipBlob], 'backup.zip', { type: 'application/zip' });
    const parsedZip = await parseImportPayload(zipFile);
    expect(parsedZip).toEqual(parsedJson);
  });

  it('restores tasks, stream entries, and settings without dropping records', async () => {
    const payload = buildBackupPayload({
      tasks: [createTask()],
      streamEntries: [createStreamEntry()],
      settings: { theme: 'dark', 'sync-provider': 'webdav' },
      platform: 'capacitor',
    });

    const restored = {
      tasks: [] as Task[],
      streamEntries: [] as StreamEntry[],
      settings: [] as [string, string][],
    };

    const result = await importPayloadToStore(
      {
        putTask: async (task) => {
          restored.tasks.push(task);
        },
        putStreamEntry: async (entry) => {
          restored.streamEntries.push(entry);
        },
        putSetting: async (key, value) => {
          restored.settings.push([key, value]);
        },
      },
      payload,
    );

    expect(result).toEqual({
      tasksImported: 1,
      streamImported: 1,
      settingsImported: 2,
    });
    expect(restored.tasks[0]?.title).toBe('Prepare release');
    expect(restored.tasks[0]?.body).toContain('backup import');
    expect(restored.streamEntries[0]?.content).toContain('backup import');
    expect(restored.streamEntries[0]?.extractedTaskId).toBeUndefined();
    expect(restored.settings).toEqual([
      ['theme', 'dark'],
      ['sync-provider', 'webdav'],
    ]);
  });

  it('recognizes legacy file-based backups so restore can stop safely', () => {
    expect(
      isLegacyBackupPayload({
        files: [{ path: 'tasks/task-1.md', content: '# legacy' }],
      }),
    ).toBe(true);
    expect(
      isLegacyBackupPayload({
        tasks: ['{}'],
        files: [{ path: 'tasks/task-1.md', content: '# mixed' }],
      }),
    ).toBe(false);
  });
});
