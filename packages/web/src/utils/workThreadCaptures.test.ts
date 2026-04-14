import { describe, expect, it } from 'vitest';
import {
  appendRawCaptureToMarkdown,
  buildRawCaptureEvent,
  buildRawCaptureEvents,
  collectNewRawCaptureCandidates,
  extractRawCaptureCandidates,
} from './workThreadCaptures';

describe('extractRawCaptureCandidates', () => {
  it('keeps free-form paragraphs while ignoring structured runtime blocks', () => {
    const captures = extractRawCaptureCandidates(`## Focus

Need to verify the plugin gateway latency.

- [ ] Draft a benchmark

### Waiting · tool: Gateway token

Waiting for a fresh key

[Latency note](https://example.com/latency)
`);

    expect(captures).toEqual([
      {
        text: 'Need to verify the plugin gateway latency.',
        kind: 'note',
        blockIndex: 0,
      },
      {
        text: '[Latency note](https://example.com/latency)',
        kind: 'resource',
        blockIndex: 1,
      },
    ]);
  });
});

describe('collectNewRawCaptureCandidates', () => {
  it('returns only newly added free-form blocks', () => {
    const previousMarkdown = `Need to verify the plugin gateway latency.`;
    const nextMarkdown = `Need to verify the plugin gateway latency.

Codex worker timed out while loading plugin metadata.

https://example.com/gateway-note`;

    expect(collectNewRawCaptureCandidates(previousMarkdown, nextMarkdown)).toEqual([
      {
        text: 'Codex worker timed out while loading plugin metadata.',
        kind: 'note',
        blockIndex: 1,
      },
      {
        text: 'https://example.com/gateway-note',
        kind: 'resource',
        blockIndex: 2,
      },
    ]);
  });
});

describe('buildRawCaptureEvents', () => {
  it('builds raw capture events with editor metadata', () => {
    const events = buildRawCaptureEvents(
      'thread-1',
      'Need to verify the plugin gateway latency.',
      `Need to verify the plugin gateway latency.

Codex worker timed out while loading plugin metadata.`,
      123,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      threadId: 'thread-1',
      type: 'raw_capture_added',
      actor: 'user',
      detailMarkdown: 'Codex worker timed out while loading plugin metadata.',
      payload: {
        source: 'editor',
        kind: 'note',
        blockIndex: 1,
      },
      createdAt: 123,
    });
  });
});

describe('appendRawCaptureToMarkdown', () => {
  it('appends a capture block with paragraph spacing', () => {
    expect(
      appendRawCaptureToMarkdown(
        '## Focus\n\nNeed to verify the plugin gateway latency.\n',
        '\nCodex worker timed out while loading plugin metadata.\n',
      ),
    ).toBe(`## Focus

Need to verify the plugin gateway latency.

Codex worker timed out while loading plugin metadata.`);
  });
});

describe('buildRawCaptureEvent', () => {
  it('keeps the originating capture source in payload metadata', () => {
    expect(
      buildRawCaptureEvent('thread-1', 'https://example.com/gateway-note', {
        source: 'brain-dump',
        blockIndex: 3,
        now: 456,
      }),
    ).toMatchObject({
      threadId: 'thread-1',
      type: 'raw_capture_added',
      detailMarkdown: 'https://example.com/gateway-note',
      payload: {
        source: 'brain-dump',
        kind: 'resource',
        blockIndex: 3,
      },
      createdAt: 456,
    });
  });
});
