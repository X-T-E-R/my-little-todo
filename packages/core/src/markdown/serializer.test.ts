import { describe, expect, it } from 'vitest';
import type { StreamEntry } from '../models/stream.js';
import type { Task } from '../models/task.js';
import { serializeStreamFile, serializeTaskFile } from './serializer.js';

function makeEntry(overrides: Partial<StreamEntry> & { content: string }): StreamEntry {
  return {
    id: 'se-20260322-100000',
    timestamp: new Date('2026-03-22T10:00:00'),
    tags: [],
    attachments: [],
    entryType: 'spark',
    ...overrides,
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: 't-20260320-100000',
    title: '测试任务',
    status: 'active',
    createdAt: new Date('2026-03-20T10:00:00.000Z'),
    updatedAt: new Date('2026-03-21T08:00:00.000Z'),
    tags: [],
    body: '',
    subtaskIds: [],
    resources: [],
    reminders: [],
    submissions: [],
    postponements: [],
    ...overrides,
  };
}

describe('serializeStreamFile', () => {
  const dateKey = '2026-03-22';

  it('produces valid markdown with front matter', () => {
    const entries = [makeEntry({ content: '测试内容' })];
    const result = serializeStreamFile(entries, dateKey);

    expect(result).toContain('---');
    expect(result).toContain(`date: ${dateKey}`);
    expect(result).toContain('entries: 1');
    expect(result).toContain('- 10:00:00 | 测试内容');
  });

  it('sorts entries by time descending', () => {
    const entries = [
      makeEntry({
        id: 'se-1',
        content: '早上',
        timestamp: new Date('2026-03-22T08:00:00'),
      }),
      makeEntry({
        id: 'se-2',
        content: '下午',
        timestamp: new Date('2026-03-22T14:00:00'),
      }),
    ];
    const result = serializeStreamFile(entries, dateKey);
    const lines = result.split('\n').filter((l) => l.startsWith('- '));
    expect(lines[0]).toContain('下午');
    expect(lines[1]).toContain('早上');
  });

  it('includes [task] type tag for task entries', () => {
    const entries = [makeEntry({ content: '提取的任务', entryType: 'task' })];
    const result = serializeStreamFile(entries, dateKey);
    expect(result).toContain('[task]');
  });

  it('does not include [spark] type tag (spark is default)', () => {
    const entries = [makeEntry({ content: '灵感', entryType: 'spark' })];
    const result = serializeStreamFile(entries, dateKey);
    expect(result).not.toContain('[spark]');
  });

  it('appends role reference', () => {
    const entries = [makeEntry({ content: '开会', roleId: 'dev-lead' })];
    const result = serializeStreamFile(entries, dateKey);
    expect(result).toContain('@role:dev-lead');
  });

  it('appends task reference', () => {
    const entries = [makeEntry({ content: '完成了', extractedTaskId: 't-20260320-100000' })];
    const result = serializeStreamFile(entries, dateKey);
    expect(result).toContain('→ [t-20260320-100000]');
  });

  it('handles empty entries array', () => {
    const result = serializeStreamFile([], dateKey);
    expect(result).toContain('entries: 0');
  });
});

describe('serializeTaskFile', () => {
  it('serializes required fields in front matter', () => {
    const task = makeTask();
    const result = serializeTaskFile(task);

    expect(result).toContain('id: t-20260320-100000');
    expect(result).toContain('title: 测试任务');
    expect(result).toContain('status: active');
    expect(result).toContain('created: 2026-03-20T10:00:00.000Z');
    expect(result).toContain('updated: 2026-03-21T08:00:00.000Z');
  });

  it('serializes optional fields when present', () => {
    const task = makeTask({
      ddl: new Date('2026-04-01T23:59:00.000Z'),
      ddlType: 'hard',
      plannedAt: new Date('2026-03-25T09:00:00.000Z'),
      roleId: 'researcher',
      tags: ['论文', 'urgent'],
      priority: 5,
      sourceStreamId: 'se-1',
      subtaskIds: ['t-2', 't-3'],
      parentId: 't-0',
    });
    const result = serializeTaskFile(task);

    expect(result).toContain('ddl: 2026-04-01T23:59:00.000Z');
    expect(result).toContain('ddl_type: hard');
    expect(result).toContain('planned: 2026-03-25T09:00:00.000Z');
    expect(result).toContain('role: researcher');
    expect(result).toContain('tags: [论文, urgent]');
    expect(result).toContain('priority: 5');
    expect(result).toContain('source: se-1');
    expect(result).toContain('subtasks: [t-2, t-3]');
    expect(result).toContain('parent: t-0');
  });

  it('omits optional fields when absent', () => {
    const result = serializeTaskFile(makeTask());
    expect(result).not.toContain('ddl:');
    expect(result).not.toContain('role:');
    expect(result).not.toContain('priority:');
    expect(result).not.toContain('parent:');
  });

  it('includes body content', () => {
    const task = makeTask({ body: '这是正文\n有多行' });
    const result = serializeTaskFile(task);
    expect(result).toContain('这是正文\n有多行');
  });

  it('outputs 暂无 for empty structured sections', () => {
    const result = serializeTaskFile(makeTask());
    expect(result).toContain('## Resources');
    expect(result).toContain('## Reminders');
    expect(result).toContain('## Submissions');
    expect(result).toContain('## Postponements');
    const occurrences = (result.match(/（暂无）/g) || []).length;
    expect(occurrences).toBe(4);
  });

  it('serializes resources', () => {
    const task = makeTask({
      resources: [
        {
          type: 'link',
          url: 'https://example.com',
          title: '参考',
          addedAt: new Date('2026-03-20'),
        },
        {
          type: 'note',
          title: '笔记内容',
          addedAt: new Date('2026-03-21'),
        },
      ],
    });
    const result = serializeTaskFile(task);
    expect(result).toContain('[link] https://example.com 参考');
    expect(result).toContain('[note] 笔记内容');
  });

  it('serializes reminders', () => {
    const task = makeTask({
      reminders: [
        {
          id: 'rem-1',
          time: new Date('2026-03-25T09:00:00.000Z'),
          notified: true,
          label: '提交',
        },
        {
          id: 'rem-2',
          time: new Date('2026-03-28T09:00:00.000Z'),
          notified: false,
        },
      ],
    });
    const result = serializeTaskFile(task);
    expect(result).toContain('rem-1 | 2026-03-25T09:00:00.000Z | notified | 提交');
    expect(result).toContain('rem-2 | 2026-03-28T09:00:00.000Z | pending');
  });
});
