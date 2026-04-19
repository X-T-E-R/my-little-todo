import type { WorkThreadEvent } from '@my-little-todo/core';
import { describe, expect, it } from 'vitest';
import {
  buildWorkThreadRestoreHistory,
  buildWorkThreadTimelineItems,
  getWorkThreadEventMetaLabel,
  getWorkThreadEventDisplayTitle,
  summarizeWorkThreadEventDetail,
} from './workThreadHistory';

function createEvent(overrides: Partial<WorkThreadEvent>): WorkThreadEvent {
  return {
    id: overrides.id ?? 'event-1',
    threadId: overrides.threadId ?? 'thread-1',
    type: overrides.type ?? 'context_added',
    actor: overrides.actor ?? 'user',
    title: overrides.title ?? 'Sample event',
    detailMarkdown: overrides.detailMarkdown,
    payload: overrides.payload,
    createdAt: overrides.createdAt ?? 100,
  };
}

describe('summarizeWorkThreadEventDetail', () => {
  it('converts markdown into compact plain-text history summaries', () => {
    const event = createEvent({
      detailMarkdown: '### Note\n\nUse `gateway-a` after token refresh.',
    });

    expect(summarizeWorkThreadEventDetail(event)).toBe(
      'Note Use gateway-a after token refresh.',
    );
  });
});

describe('getWorkThreadEventMetaLabel', () => {
  it('keeps raw capture source labels visible', () => {
    const event = createEvent({
      type: 'raw_capture_added',
      payload: {
        source: 'brain-dump',
      },
    });

    expect(getWorkThreadEventMetaLabel(event)).toBe('capture · brain-dump');
  });

  it('maps waiting and interrupt events to the unified block label', () => {
    const event = createEvent({
      type: 'waiting_updated',
      title: 'Added block: API key',
    });

    expect(getWorkThreadEventMetaLabel(event)).toBe('block');
    expect(getWorkThreadEventDisplayTitle(event)).toBe('Block: API key');
  });
});

describe('buildWorkThreadRestoreHistory', () => {
  it('groups events into restore-oriented buckets', () => {
    const history = buildWorkThreadRestoreHistory([
      createEvent({
        id: 'waiting',
        type: 'waiting_updated',
        title: 'Added waiting condition: API key',
        createdAt: 90,
      }),
      createEvent({
        id: 'capture',
        type: 'raw_capture_added',
        title: 'Captured gateway note',
        detailMarkdown: 'Refresh key before retrying.',
        payload: { source: 'editor' },
        createdAt: 120,
      }),
      createEvent({
        id: 'decision',
        type: 'decision_recorded',
        title: 'Use shared gateway',
        createdAt: 110,
      }),
      createEvent({
        id: 'next-step',
        type: 'next_action_added',
        title: 'Added next action: verify fallback',
        createdAt: 100,
      }),
    ]);

    expect(history.captures.map((item) => item.id)).toEqual(['capture']);
    expect(history.decisions.map((item) => item.id)).toEqual(['decision']);
    expect(history.nextSteps.map((item) => item.id)).toEqual(['next-step']);
    expect(history.blockers.map((item) => item.id)).toEqual(['waiting']);
  });
});

describe('buildWorkThreadTimelineItems', () => {
  it('returns newest-first timeline entries with cleaned summaries', () => {
    const timeline = buildWorkThreadTimelineItems([
      createEvent({
        id: 'older',
        createdAt: 10,
        detailMarkdown: 'First item',
      }),
      createEvent({
        id: 'newer',
        createdAt: 20,
        detailMarkdown: '**Second** item',
      }),
    ]);

    expect(timeline.map((item) => item.id)).toEqual(['newer', 'older']);
    expect(timeline[0]?.summary).toBe('Second item');
  });
});
