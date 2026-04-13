import { describe, expect, it } from 'vitest';
import type { Task } from '../models/task.js';
import { type TaskDbRow, taskFromDbRow, taskToDbRow } from './taskRow.js';

function minimalTask(over: Partial<Task> = {}): Task {
  const now = new Date('2026-04-09T10:00:00.000Z');
  return {
    id: 't-row-1',
    title: 'Hello',
    status: 'inbox',
    createdAt: now,
    updatedAt: now,
    tags: [],
    body: 'Body text',
    subtaskIds: [],
    resources: [],
    reminders: [],
    submissions: [],
    postponements: [],
    statusHistory: [],
    ...over,
  };
}

describe('taskToDbRow / taskFromDbRow roundtrip', () => {
  it('preserves minimal task', () => {
    const t = minimalTask();
    const row = taskToDbRow(t, 42, null);
    const back = taskFromDbRow(row as TaskDbRow);
    expect(back.id).toBe(t.id);
    expect(back.title).toBe(t.title);
    expect(back.status).toBe(t.status);
    expect(back.body).toBe(t.body);
    expect(back.createdAt.getTime()).toBe(t.createdAt.getTime());
    expect(back.updatedAt.getTime()).toBe(t.updatedAt.getTime());
  });

  it('preserves single and multi role fields', () => {
    const single = minimalTask({ roleId: 'r1' });
    let row = taskToDbRow(single, 1, null);
    let back = taskFromDbRow(row as TaskDbRow);
    expect(back.roleId).toBe('r1');
    expect(back.roleIds).toBeUndefined();

    const multi = minimalTask({ roleId: 'a', roleIds: ['a', 'b'] });
    row = taskToDbRow(multi, 2, null);
    back = taskFromDbRow(row as TaskDbRow);
    expect(back.roleId).toBe('a');
    expect(back.roleIds).toEqual(['a', 'b']);
  });

  it('preserves tags and reminders', () => {
    const t = minimalTask({
      tags: ['a', 'b'],
      reminders: [
        {
          id: 'r1',
          time: new Date('2026-05-01T08:00:00.000Z'),
          notified: false,
          label: 'L',
        },
      ],
    });
    const row = taskToDbRow(t, 3, null);
    const back = taskFromDbRow(row as TaskDbRow);
    expect(back.tags).toEqual(['a', 'b']);
    expect(back.reminders).toHaveLength(1);
    expect(back.reminders[0].id).toBe('r1');
    expect(back.reminders[0].time.getTime()).toBe(t.reminders[0].time.getTime());
  });

  it('maps deleted_at to Task shape via row', () => {
    const t = minimalTask();
    const del = new Date('2026-06-01T00:00:00.000Z').getTime();
    const row = taskToDbRow(t, 5, del);
    expect(row.deleted_at).toBe(del);
  });

  it('preserves taskType project', () => {
    const t = minimalTask({ taskType: 'project' });
    const row = taskToDbRow(t, 1, null);
    expect(row.task_type).toBe('project');
    const back = taskFromDbRow(row as TaskDbRow);
    expect(back.taskType).toBe('project');
  });
});
