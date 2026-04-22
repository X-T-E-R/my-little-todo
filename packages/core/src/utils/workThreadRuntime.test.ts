import { describe, expect, it } from 'vitest';
import type { Task } from '../models/task.js';
import { createWorkThread, deriveWorkingSet, pickWorkThreadForNow } from './workThreadRuntime.js';

function makeTask(id: string, ddlMs?: number): Task {
  const now = new Date();
  return {
    id,
    title: id,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    tags: [],
    body: '',
    subtaskIds: [],
    resources: [],
    reminders: [],
    submissions: [],
    postponements: [],
    statusHistory: [],
    ddl: ddlMs != null ? new Date(ddlMs) : undefined,
  };
}

describe('createWorkThread', () => {
  it('creates an active thread with body/block defaults', () => {
    const thread = createWorkThread({ title: 'COMSOL case' });
    expect(thread.status).toBe('active');
    expect(thread.mission).toBe('COMSOL case');
    expect(thread.bodyMarkdown).toBe('');
    expect(thread.blocks).toEqual([]);
    expect(thread.resumeCard.nextStep).toBe('');
    expect(thread.workingSet).toEqual([]);
  });
});

describe('deriveWorkingSet', () => {
  it('caps the working set to the latest five context items', () => {
    const items = Array.from({ length: 8 }, (_value, index) => ({
      id: `ctx-${index}`,
      kind: 'note' as const,
      title: `Item ${index}`,
      addedAt: index,
    }));
    const set = deriveWorkingSet(items);
    expect(set).toHaveLength(5);
    expect(set[0]?.contextItemId).toBe('ctx-0');
    expect(set[4]?.contextItemId).toBe('ctx-4');
  });
});

describe('pickWorkThreadForNow', () => {
  it('returns active thread first regardless of policy', () => {
    const active = createWorkThread({ title: 'Run me', status: 'active' });
    const paused = createWorkThread({ title: 'Paused thread', status: 'paused' });
    const out = pickWorkThreadForNow([paused, active], 'manual');
    expect(out?.thread.id).toBe(active.id);
  });

  it('returns null in manual mode when nothing is already active', () => {
    const paused = createWorkThread({ title: 'Paused thread', status: 'paused' });
    const out = pickWorkThreadForNow([paused], 'manual');
    expect(out).toBeNull();
  });

  it('prefers paused threads with a concrete resume cue', () => {
    const plain = createWorkThread({ title: 'Plain', status: 'paused' });
    const ready = {
      ...createWorkThread({ title: 'Resume me', status: 'paused' }),
      resume: 'Run the benchmark again.',
    };
    const out = pickWorkThreadForNow([plain, ready], 'coach');
    expect(out?.thread.id).toBe(ready.id);
  });

  it('boosts threads linked to urgent tasks', () => {
    const urgent = {
      ...createWorkThread({ title: 'Need attention', status: 'paused' }),
      blocks: [
        {
          id: 'b-1',
          kind: 'task' as const,
          taskAlias: 'task' as const,
          title: 'Submit draft',
          body: 'Submit the draft.',
          status: 'todo' as const,
          linkedTaskId: 'task-1',
          sortKey: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      resume: 'Submit the draft.',
    };
    const casual = createWorkThread({ title: 'Casual read', status: 'paused' });
    const out = pickWorkThreadForNow(
      [casual, urgent],
      'semi_auto',
      [makeTask('task-1', Date.now() + 24 * 3600 * 1000)],
    );
    expect(out?.thread.id).toBe(urgent.id);
  });
});
