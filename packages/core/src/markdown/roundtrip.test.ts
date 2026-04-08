import { describe, expect, it } from 'vitest';
import type { Task } from '../models/task.js';
import { parseStreamFile, parseTaskFile } from './parser.js';
import { serializeStreamFile, serializeTaskFile } from './serializer.js';

function makeFullTask(): Task {
  return {
    id: 't-20260320-100000',
    title: '往返测试任务',
    status: 'active',
    createdAt: new Date('2026-03-20T10:00:00.000Z'),
    updatedAt: new Date('2026-03-21T08:00:00.000Z'),
    completedAt: undefined,
    ddl: new Date('2026-04-01T23:59:00.000Z'),
    ddlType: 'hard',
    plannedAt: new Date('2026-03-25T09:00:00.000Z'),
    roleId: 'researcher',
    tags: ['论文', 'urgent'],
    priority: 5,
    body: '这是正文内容\n包含多行',
    subtaskIds: ['t-2', 't-3'],
    parentId: 't-0',
    sourceStreamId: 'se-20260320-100000',
    resources: [
      {
        type: 'link',
        url: 'https://example.com',
        title: '参考文献',
        addedAt: new Date('2026-03-20T00:00:00.000Z'),
      },
    ],
    reminders: [
      {
        id: 'rem-1',
        time: new Date('2026-03-25T09:00:00.000Z'),
        notified: true,
        label: '记得交',
      },
    ],
    submissions: [],
    postponements: [],
  };
}

describe('task roundtrip: serialize -> parse', () => {
  it('preserves all scalar fields', () => {
    const original = makeFullTask();
    const serialized = serializeTaskFile(original);
    const parsed = parseTaskFile(serialized);

    expect(parsed.id).toBe(original.id);
    expect(parsed.title).toBe(original.title);
    expect(parsed.status).toBe(original.status);
    expect(parsed.ddlType).toBe(original.ddlType);
    expect(parsed.roleId).toBe(original.roleId);
    expect(parsed.priority).toBe(original.priority);
    expect(parsed.parentId).toBe(original.parentId);
    expect(parsed.sourceStreamId).toBe(original.sourceStreamId);
  });

  it('preserves date fields', () => {
    const original = makeFullTask();
    const serialized = serializeTaskFile(original);
    const parsed = parseTaskFile(serialized);

    expect(parsed.createdAt.getTime()).toBe(original.createdAt.getTime());
    expect(parsed.updatedAt.getTime()).toBe(original.updatedAt.getTime());
    expect(parsed.ddl?.getTime()).toBe(original.ddl?.getTime());
    expect(parsed.plannedAt?.getTime()).toBe(original.plannedAt?.getTime());
  });

  it('preserves array fields', () => {
    const original = makeFullTask();
    const serialized = serializeTaskFile(original);
    const parsed = parseTaskFile(serialized);

    expect(parsed.tags).toEqual(original.tags);
    expect(parsed.subtaskIds).toEqual(original.subtaskIds);
  });

  it('preserves body content', () => {
    const original = makeFullTask();
    const serialized = serializeTaskFile(original);
    const parsed = parseTaskFile(serialized);

    expect(parsed.body).toBe(original.body);
  });

  it('preserves reminders', () => {
    const original = makeFullTask();
    const serialized = serializeTaskFile(original);
    const parsed = parseTaskFile(serialized);

    expect(parsed.reminders).toHaveLength(original.reminders.length);
    expect(parsed.reminders[0].id).toBe(original.reminders[0].id);
    expect(parsed.reminders[0].time.getTime()).toBe(original.reminders[0].time.getTime());
    expect(parsed.reminders[0].notified).toBe(original.reminders[0].notified);
    expect(parsed.reminders[0].label).toBe(original.reminders[0].label);
  });

  it('preserves resources', () => {
    const original = makeFullTask();
    const serialized = serializeTaskFile(original);
    const parsed = parseTaskFile(serialized);

    expect(parsed.resources).toHaveLength(original.resources.length);
    expect(parsed.resources[0].type).toBe(original.resources[0].type);
    expect(parsed.resources[0].title).toBe(original.resources[0].title);
    expect(parsed.resources[0].url).toBe(original.resources[0].url);
  });

  it('preserves multiple roles', () => {
    const original = makeFullTask();
    original.roleId = 'a';
    original.roleIds = ['a', 'b', 'c'];
    const serialized = serializeTaskFile(original);
    const parsed = parseTaskFile(serialized);
    expect(parsed.roleId).toBe('a');
    expect(parsed.roleIds).toEqual(['a', 'b', 'c']);
  });

  it('handles minimal task roundtrip', () => {
    const minimal: Task = {
      id: 't-min',
      title: '最小',
      status: 'inbox',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      tags: [],
      body: '',
      subtaskIds: [],
      resources: [],
      reminders: [],
      submissions: [],
      postponements: [],
    };
    const parsed = parseTaskFile(serializeTaskFile(minimal));
    expect(parsed.id).toBe(minimal.id);
    expect(parsed.title).toBe(minimal.title);
    expect(parsed.status).toBe(minimal.status);
    expect(parsed.tags).toEqual([]);
    expect(parsed.body).toBe('');
  });
});

describe('stream roundtrip: serialize -> parse', () => {
  const dateKey = '2026-03-22';

  it('preserves basic entry content', () => {
    const entries = [
      {
        id: 'se-20260322-100000',
        content: '今天开始写论文了',
        timestamp: new Date('2026-03-22T10:00:00'),
        tags: [],
        attachments: [],
        entryType: 'spark' as const,
      },
    ];
    const serialized = serializeStreamFile(entries, dateKey);
    const parsed = parseStreamFile(serialized, dateKey);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].content).toBe('今天开始写论文了');
    expect(parsed[0].entryType).toBe('spark');
    expect(parsed[0].timestamp.getTime()).toBe(entries[0].timestamp.getTime());
  });

  it('preserves task type entries', () => {
    const entries = [
      {
        id: 'se-1',
        content: '需要完成报告',
        timestamp: new Date('2026-03-22T14:00:00'),
        tags: [],
        attachments: [],
        entryType: 'task' as const,
      },
    ];
    const serialized = serializeStreamFile(entries, dateKey);
    const parsed = parseStreamFile(serialized, dateKey);
    expect(parsed[0].entryType).toBe('task');
    expect(parsed[0].content).toBe('需要完成报告');
  });

  it('preserves role references', () => {
    const entries = [
      {
        id: 'se-1',
        content: '开会讨论',
        timestamp: new Date('2026-03-22T10:00:00'),
        tags: [],
        attachments: [],
        entryType: 'spark' as const,
        roleId: 'dev-lead',
      },
    ];
    const serialized = serializeStreamFile(entries, dateKey);
    const parsed = parseStreamFile(serialized, dateKey);
    expect(parsed[0].roleId).toBe('dev-lead');
  });

  it('preserves task references', () => {
    const entries = [
      {
        id: 'se-1',
        content: '完成了任务',
        timestamp: new Date('2026-03-22T10:00:00'),
        tags: [],
        attachments: [],
        entryType: 'spark' as const,
        extractedTaskId: 't-20260320-100000',
      },
    ];
    const serialized = serializeStreamFile(entries, dateKey);
    const parsed = parseStreamFile(serialized, dateKey);
    expect(parsed[0].extractedTaskId).toBe('t-20260320-100000');
  });
});
