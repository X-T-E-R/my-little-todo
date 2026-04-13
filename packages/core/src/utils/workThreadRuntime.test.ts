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
  it('creates a ready thread with mission and resume card defaults', () => {
    const thread = createWorkThread({ title: 'COMSOL case' });
    expect(thread.status).toBe('ready');
    expect(thread.mission).toBe('COMSOL case');
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
  it('returns running thread first regardless of policy', () => {
    const running = createWorkThread({ title: 'Run me', status: 'running' });
    const ready = createWorkThread({ title: 'Ready thread' });
    const out = pickWorkThreadForNow([ready, running], 'manual');
    expect(out?.thread.id).toBe(running.id);
  });

  it('returns null in manual mode when nothing is already running', () => {
    const ready = createWorkThread({ title: 'Ready thread' });
    const out = pickWorkThreadForNow([ready], 'manual');
    expect(out).toBeNull();
  });

  it('prefers ready threads with a concrete next step', () => {
    const plain = createWorkThread({ title: 'Plain' });
    const ready = {
      ...createWorkThread({ title: 'Resume me' }),
      resumeCard: {
        summary: 'We already know the path.',
        nextStep: 'Run the benchmark again.',
        guardrails: [],
        updatedAt: Date.now(),
      },
    };
    const out = pickWorkThreadForNow([plain, ready], 'coach');
    expect(out?.thread.id).toBe(ready.id);
  });

  it('boosts threads linked to urgent tasks', () => {
    const urgent = {
      ...createWorkThread({ title: 'Need attention' }),
      nextActions: [
        {
          id: 'a-1',
          text: 'Submit draft',
          done: false,
          source: 'user' as const,
          linkedTaskId: 'task-1',
          createdAt: Date.now(),
        },
      ],
      resumeCard: {
        summary: 'Draft is almost there.',
        nextStep: 'Submit the draft.',
        guardrails: [],
        updatedAt: Date.now(),
      },
    };
    const casual = createWorkThread({ title: 'Casual read' });
    const out = pickWorkThreadForNow(
      [casual, urgent],
      'semi_auto',
      [makeTask('task-1', Date.now() + 24 * 3600 * 1000)],
    );
    expect(out?.thread.id).toBe(urgent.id);
  });
});
