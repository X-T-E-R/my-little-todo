import { describe, expect, it } from 'vitest';
import type { Task } from '../models/task.js';
import {
  TASK_PHASE_ORDER,
  estimateTaskProgress,
  isNearFinishing,
  isSmallTask,
  nextPhase,
  phaseIndex,
} from './taskProgress.js';

function minimalTask(over: Partial<Task>): Task {
  return {
    id: 't-base',
    title: 'Title',
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    tags: [],
    body: 'body',
    subtaskIds: [],
    resources: [],
    reminders: [],
    submissions: [],
    postponements: [],
    statusHistory: [],
    ...over,
  };
}

describe('phaseIndex', () => {
  it('returns index for known phases', () => {
    expect(phaseIndex('understood')).toBe(0);
    expect(phaseIndex('wrapping_up')).toBe(TASK_PHASE_ORDER.length - 1);
  });

  it('returns -1 for undefined', () => {
    expect(phaseIndex(undefined)).toBe(-1);
  });
});

describe('estimateTaskProgress', () => {
  it('uses phase baseline when no subtasks', () => {
    const t = minimalTask({ phase: 'understood' });
    const p = estimateTaskProgress(t, [t]);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('weights subtask completion', () => {
    const parent = minimalTask({
      id: 'p',
      subtaskIds: ['c1', 'c2'],
      phase: 'understood',
    });
    const c1 = minimalTask({ id: 'c1', status: 'completed' });
    const c2 = minimalTask({ id: 'c2', status: 'active' });
    const all = [parent, c1, c2];
    const p = estimateTaskProgress(parent, all);
    expect(p).toBeGreaterThan(0.4);
  });

  it('adds small bump from progress logs when no subs', () => {
    const t = minimalTask({
      phase: 'understood',
      progressLogs: [
        {
          id: '1',
          timestamp: new Date(),
          content: 'x',
          source: 'manual',
        },
      ],
    });
    const p = estimateTaskProgress(t, [t]);
    expect(p).toBeGreaterThan(0);
  });
});

describe('isNearFinishing', () => {
  it('true for core_done', () => {
    const t = minimalTask({ phase: 'core_done' });
    expect(isNearFinishing(t, [t])).toBe(true);
  });

  it('true for wrapping_up', () => {
    const t = minimalTask({ phase: 'wrapping_up' });
    expect(isNearFinishing(t, [t])).toBe(true);
  });
});

describe('isSmallTask', () => {
  it('true when no subs and short body/title', () => {
    const t = minimalTask({
      subtaskIds: [],
      body: 'short',
      title: 'Hi',
    });
    expect(isSmallTask(t)).toBe(true);
  });

  it('false when subtasks exist', () => {
    const t = minimalTask({
      subtaskIds: ['x'],
      body: 'x',
    });
    expect(isSmallTask(t)).toBe(false);
  });
});

describe('nextPhase', () => {
  it('starts at understood from undefined', () => {
    expect(nextPhase(undefined)).toBe('understood');
  });

  it('advances along order', () => {
    expect(nextPhase('understood')).toBe('exploring');
  });

  it('undefined at end', () => {
    expect(nextPhase('wrapping_up')).toBeUndefined();
  });
});
