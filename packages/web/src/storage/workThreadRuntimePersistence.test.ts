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
      rootMarkdown: '先跑通一个 COMSOL 样例。',
      explorationMarkdown: '这里放探索资料。',
      waitingFor: [
        {
          id: 'w-1',
          kind: 'file',
          title: 'Sample output',
          parentThreadId: 'thread-root',
          satisfied: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      intents: [
        {
          id: 'intent-1',
          text: '先把专利检索跑通',
          bodyMarkdown: '先确认检索入口。',
          collapsed: true,
          parentThreadId: 'thread-root',
          state: 'active',
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      sparkContainers: [
        {
          id: 'spark-1',
          title: '专利写作分支',
          bodyMarkdown: '后续单开线程。',
          collapsed: false,
          parentThreadId: 'thread-root',
          parentIntentId: 'intent-1',
          streamEntryId: 'stream-1',
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      interrupts: [
        {
          id: 'i-1',
          source: 'manual',
          title: 'Phone call',
          content: 'Need to reply after lunch.',
          parentThreadId: 'thread-root',
          capturedAt: 2,
          resolved: false,
        },
      ],
      syncMeta: {
        mode: 'hybrid',
        filePath: 'C:/threads/comsol.md',
        lastExportedHash: 'abc',
      },
      explorationBlocks: [
        {
          id: 'xb-1',
          title: 'Sweep setup',
          summary: '先确认参数扫描的边界条件。',
          anchor: {
            kind: 'spark_ref',
            refId: 'stream-1',
          },
          collapsed: true,
          createdAt: 3,
          updatedAt: 4,
        },
      ],
      inlineAnchors: [
        {
          id: 'anchor-1',
          kind: 'intent',
          marker: '[[intent:intent-1|先把专利检索跑通]]',
          refId: 'intent-1',
          createdAt: 5,
          updatedAt: 5,
        },
      ],
    };

    const raw = serializeWorkThread(thread);
    const roundTrip = deserializeWorkThread(raw);

    expect(roundTrip.mission).toBe('Run the COMSOL sample through once.');
    expect(roundTrip.lane).toBe('execution');
    expect(roundTrip.rootMarkdown).toBe('先跑通一个 COMSOL 样例。');
    expect(roundTrip.explorationMarkdown).toBe('这里放探索资料。');
    expect(roundTrip.waitingFor[0]?.title).toBe('Sample output');
    expect(roundTrip.intents[0]?.text).toBe('先把专利检索跑通');
    expect(roundTrip.intents[0]?.bodyMarkdown).toBe('先确认检索入口。');
    expect(roundTrip.sparkContainers[0]?.title).toBe('专利写作分支');
    expect(roundTrip.sparkContainers[0]?.parentIntentId).toBe('intent-1');
    expect(roundTrip.interrupts[0]?.title).toBe('Phone call');
    expect(roundTrip.syncMeta?.mode).toBe('hybrid');
    expect(roundTrip.syncMeta?.filePath).toBe('C:/threads/comsol.md');
    expect(roundTrip.explorationBlocks).toEqual([
      {
        id: 'xb-1',
        title: 'Sweep setup',
        summary: '先确认参数扫描的边界条件。',
        anchor: {
          kind: 'spark_ref',
          refId: 'stream-1',
        },
        collapsed: true,
        createdAt: 3,
        updatedAt: 4,
      },
    ]);
    expect(roundTrip.inlineAnchors).toEqual([
      {
        id: 'anchor-1',
        kind: 'intent',
        marker: '[[intent:intent-1|先把专利检索跑通]]',
        refId: 'intent-1',
        createdAt: 5,
        updatedAt: 5,
      },
    ]);
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
    expect(thread.explorationBlocks).toEqual([]);
    expect(thread.sparkContainers).toEqual([]);
    expect(thread.intents).toEqual([]);
    expect(thread.inlineAnchors).toEqual([]);
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
