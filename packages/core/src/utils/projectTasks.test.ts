import { describe, expect, it } from 'vitest';
import type { Task } from '../models/task.js';
import {
  enclosingProject,
  enclosingProjectId,
  projectDescendantProgress,
  projectDirectChildProgress,
} from './projectTasks.js';

function mkTask(over: Partial<Task> & Pick<Task, 'id'>): Task {
  const now = new Date('2026-04-09T10:00:00.000Z');
  return {
    id: over.id,
    title: over.title ?? 'T',
    status: over.status ?? 'active',
    createdAt: now,
    updatedAt: now,
    tags: [],
    body: '',
    subtaskIds: over.subtaskIds ?? [],
    resources: [],
    reminders: [],
    submissions: [],
    postponements: [],
    statusHistory: [],
    ...over,
  };
}

describe('projectTasks', () => {
  it('finds enclosing project up the parent chain', () => {
    const proj = mkTask({ id: 'p1', taskType: 'project', subtaskIds: ['c1'] });
    const child = mkTask({ id: 'c1', parentId: 'p1', subtaskIds: ['g1'] });
    const grand = mkTask({ id: 'g1', parentId: 'c1' });
    const all = [proj, child, grand];
    expect(enclosingProjectId(grand, all)).toBe('p1');
    expect(enclosingProject(grand, all)?.id).toBe('p1');
  });

  it('counts descendant completion', () => {
    const proj = mkTask({ id: 'p1', taskType: 'project', subtaskIds: ['a', 'b'] });
    const a = mkTask({ id: 'a', parentId: 'p1', status: 'completed' });
    const b = mkTask({ id: 'b', parentId: 'p1', status: 'active' });
    const all = [proj, a, b];
    expect(projectDirectChildProgress(proj, all)).toEqual({ total: 2, completed: 1 });
    expect(projectDescendantProgress(proj, all)).toEqual({ total: 2, completed: 1 });
  });
});
