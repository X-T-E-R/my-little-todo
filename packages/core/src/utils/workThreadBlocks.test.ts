import { describe, expect, it } from 'vitest';
import { buildWorkThreadBlockViews } from './workThreadBlocks.js';

describe('buildWorkThreadBlockViews', () => {
  it('merges waiting and interrupt items into a single block list ordered by recency', () => {
    const blocks = buildWorkThreadBlockViews({
      waitingFor: [
        {
          id: 'w-1',
          kind: 'external',
          title: '等外部回复',
          detail: '供应商确认参数',
          satisfied: false,
          createdAt: 10,
          updatedAt: 30,
        },
      ],
      interrupts: [
        {
          id: 'i-1',
          source: 'manual',
          title: '临时插入别的事',
          content: '先记住回来继续',
          capturedAt: 50,
          resolved: false,
        },
      ],
    });

    expect(blocks).toEqual([
      {
        id: 'i-1',
        title: '临时插入别的事',
        detail: '先记住回来继续',
        state: 'open',
        sourceKind: 'interrupt',
        createdAt: 50,
        updatedAt: 50,
      },
      {
        id: 'w-1',
        title: '等外部回复',
        detail: '供应商确认参数',
        state: 'open',
        sourceKind: 'waiting',
        createdAt: 10,
        updatedAt: 30,
      },
    ]);
  });
});
