import { describe, expect, it } from 'vitest';

import {
  buildHistorySummary,
  hydrateTaskSnapshotFromRawHistory,
  isSensitiveSettingHistoryKey,
  sanitizeSettingHistorySnapshot,
} from './historyAudit';

describe('historyAudit', () => {
  it('redacts sensitive settings in history snapshots', () => {
    const snapshot = sanitizeSettingHistorySnapshot('openai_api_key', 'secret-value', {
      deletedAt: null,
      updatedAt: 123,
      version: 9,
    });

    expect(snapshot).toEqual({
      key: 'openai_api_key',
      value_redacted: true,
      value_length: 12,
      updated_at: 123,
      version: 9,
      deleted_at: null,
    });
    expect(isSensitiveSettingHistoryKey('sync_token')).toBe(true);
    expect(isSensitiveSettingHistoryKey('theme')).toBe(false);
  });

  it('hydrates task snapshots from raw task and stream history', () => {
    const taskSnapshot = hydrateTaskSnapshotFromRawHistory(
      JSON.stringify({
        id: 'se-1',
        title: 'Task',
        title_customized: 0,
        status: 'inbox',
        body: '',
        created_at: 100,
        updated_at: 120,
        role_ids: '["role-a"]',
        tags: '["task"]',
        subtask_ids: '[]',
        resources: '[]',
        reminders: '[]',
        submissions: '[]',
        postponements: '[]',
        status_history: '[]',
        progress_logs: '[]',
        version: 3,
        deleted_at: null,
      }),
      JSON.stringify({
        id: 'se-1',
        content: 'Body from stream',
        timestamp: 90,
        updated_at: 140,
        role_id: 'role-b',
        tags: '["stream"]',
      }),
    );

    expect(JSON.parse(taskSnapshot)).toMatchObject({
      id: 'se-1',
      body: 'Body from stream',
      primary_role: 'role-a',
      tags: ['task', 'stream'],
      updated_at: 140,
    });
  });

  it('builds setting summaries from redacted snapshots', () => {
    const summary = buildHistorySummary('settings', {
      key: 'sync_token',
      value_redacted: true,
      value_length: 24,
    });

    expect(summary).toBe(JSON.stringify({ key: 'sync_token', sensitive: true, value_length: 24 }));
  });
});
