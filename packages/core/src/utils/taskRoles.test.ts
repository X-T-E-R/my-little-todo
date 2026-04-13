import { describe, expect, it } from 'vitest';
import type { Task } from '../models/task.js';
import { taskRoleIds, withTaskRoles } from './taskRoles.js';

function baseTask(over: Partial<Task>): Task {
  return {
    id: 't-1',
    title: 't',
    status: 'inbox',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    body: '',
    subtaskIds: [],
    resources: [],
    reminders: [],
    submissions: [],
    postponements: [],
    statusHistory: [],
    ...over,
  };
}

describe('taskRoleIds', () => {
  it('prefers roleIds when non-empty', () => {
    expect(taskRoleIds({ roleId: 'a', roleIds: ['b', 'c'] })).toEqual(['b', 'c']);
  });

  it('deduplicates roleIds', () => {
    expect(taskRoleIds({ roleIds: ['x', 'x', 'y'] })).toEqual(['x', 'y']);
  });

  it('falls back to roleId', () => {
    expect(taskRoleIds({ roleId: 'solo' })).toEqual(['solo']);
  });

  it('returns empty when no roles', () => {
    expect(taskRoleIds({})).toEqual([]);
  });
});

describe('withTaskRoles', () => {
  it('clears roles when empty array', () => {
    const t = baseTask({ roleId: 'a', roleIds: ['a', 'b'] });
    expect(withTaskRoles(t, [])).toEqual({
      roleId: undefined,
      roleIds: undefined,
    });
  });

  it('single role uses roleId only', () => {
    const t = baseTask({});
    expect(withTaskRoles(t, ['only'])).toEqual({
      roleId: 'only',
      roleIds: undefined,
    });
  });

  it('multiple roles keeps primary and roleIds', () => {
    const t = baseTask({});
    expect(withTaskRoles(t, ['first', 'second'])).toEqual({
      roleId: 'first',
      roleIds: ['first', 'second'],
    });
  });

  it('filters empty strings', () => {
    const t = baseTask({});
    expect(withTaskRoles(t, ['a', '', 'b'])).toEqual({
      roleId: 'a',
      roleIds: ['a', 'b'],
    });
  });
});
