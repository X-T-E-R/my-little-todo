import { describe, expect, it } from 'vitest';
import type { WorkThread } from '@my-little-todo/core';
import { createWorkThread } from '@my-little-todo/core';
import {
  deserializeWorkThread,
  deserializeWorkThreadEvent,
  serializeWorkThread,
} from './workThreadStorage';

describe('workThreadStorage', () => {
  it('serializes and deserializes runtime fields', () => {
    const thread: WorkThread = {
      ...createWorkThread({
        title: 'COMSOL',
        mission: 'Run the COMSOL sample through once.',
        lane: 'execution',
      }),
      waitingFor: [
        {
          id: 'w-1',
          kind: 'file',
          title: 'Sample output',
          satisfied: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      interrupts: [
        {
          id: 'i-1',
          source: 'manual',
          title: 'Phone call',
          content: 'Need to reply after lunch.',
          capturedAt: 2,
          resolved: false,
        },
      ],
    };

    const raw = serializeWorkThread(thread);
    const roundTrip = deserializeWorkThread(raw);

    expect(roundTrip.mission).toBe('Run the COMSOL sample through once.');
    expect(roundTrip.lane).toBe('execution');
    expect(roundTrip.waitingFor[0]?.title).toBe('Sample output');
    expect(roundTrip.interrupts[0]?.title).toBe('Phone call');
    expect(roundTrip.resumeCard.updatedAt).toBeTypeOf('number');
  });

  it('hydrates a partial raw object into a full runtime thread', () => {
    const thread = deserializeWorkThread({
      id: 't-1',
      title: 'Gateway research',
      status: 'ready',
      created_at: 1,
      updated_at: 2,
    });

    expect(thread.mission).toBe('Gateway research');
    expect(thread.workingSet).toEqual([]);
    expect(thread.schedulerMeta).toEqual({});
    expect(thread.resumeCard.nextStep).toBe('');
  });

  it('parses work thread events from db-shaped rows', () => {
    const event = deserializeWorkThreadEvent({
      id: 'e-1',
      thread_id: 't-1',
      type: 'thread_dispatched',
      actor: 'system',
      title: 'Dispatch thread',
      payload: JSON.stringify({ source: 'now' }),
      created_at: 99,
    });

    expect(event.threadId).toBe('t-1');
    expect(event.payload).toEqual({ source: 'now' });
  });
});
