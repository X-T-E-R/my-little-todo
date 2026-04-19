import { describe, expect, it, vi } from 'vitest';
import { createWorkThread } from '@my-little-todo/core';
import {
  applyMarkdownPatchToThread,
  buildWorkThreadMarkdownFilename,
  resolveWorkThreadSyncFilePath,
  slugifyWorkThreadTitle,
} from './workThreadSync';

describe('workThreadSync helpers', () => {
  it('builds stable filenames from thread title and id', () => {
    expect(slugifyWorkThreadTitle('COMSOL Sample Thread')).toBe('comsol-sample-thread');
    expect(
      buildWorkThreadMarkdownFilename({
        id: 'thread-1',
        title: 'COMSOL Sample Thread',
      } as const),
    ).toBe('comsol-sample-thread--thread-1.md');
  });

  it('prefers explicit file path over generated path', () => {
    const thread = {
      ...createWorkThread({ title: 'Gateway' }),
      syncMeta: { mode: 'hybrid' as const, filePath: 'C:/threads/gateway.md' },
    };
    expect(resolveWorkThreadSyncFilePath(thread, { root: 'C:/threads' })).toBe(
      'C:/threads/gateway.md',
    );
  });

  it('imports editable runtime fields from markdown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T10:00:00Z'));
    const thread = createWorkThread({ title: 'Gateway' });
    const next = applyMarkdownPatchToThread(
      thread,
      `---
title: "Gateway thread"
mission: "Ship the gateway"
status: ready
lane: research
---

## Focus

[[task:gw|Gateway]]

## Next Actions

- [ ] Draft matrix

## Waiting

> [!waiting:person] Product answer
> Need final wording
`,
      123,
    );
    expect(next.title).toBe('Gateway thread');
    expect(next.nextActions[0]?.text).toBe('Draft matrix');
    expect(next.waitingFor[0]?.kind).toBe('person');
    expect(next.syncMeta?.lastExternalModifiedAt).toBe(123);
    vi.useRealTimers();
  });

  it('preserves runtime next actions and blocks when imported markdown uses only inline refs', () => {
    const thread = {
      ...createWorkThread({ title: 'Gateway' }),
      nextActions: [
        {
          id: 'next-1',
          text: 'Draft matrix',
          done: false,
          source: 'user' as const,
          createdAt: 1,
        },
      ],
      waitingFor: [
        {
          id: 'block-1',
          kind: 'external' as const,
          title: 'Need product answer',
          detail: 'Keep the current wording on hold',
          satisfied: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    const next = applyMarkdownPatchToThread(
      thread,
      `---
title: "Gateway thread"
mission: "Ship the gateway"
status: ready
lane: research
---

## Focus

[[intent:intent-1|Clarify gateway direction]]

[[next:next-1|Draft matrix]]

[[block:block-1|Need product answer]]
`,
      123,
    );

    expect(next.nextActions).toHaveLength(1);
    expect(next.waitingFor).toHaveLength(1);
    expect(next.nextActions[0]?.text).toBe('Draft matrix');
    expect(next.waitingFor[0]?.title).toBe('Need product answer');
  });

  it('treats callout and checklist markdown as authoritative for doc runtime fields', () => {
    const thread = {
      ...createWorkThread({ title: 'Gateway' }),
      nextActions: [
        {
          id: 'next-1',
          text: 'Draft matrix',
          done: false,
          source: 'user' as const,
          createdAt: 1,
        },
      ],
      waitingFor: [
        {
          id: 'block-1',
          kind: 'external' as const,
          title: 'Need product answer',
          detail: 'Keep the current wording on hold',
          satisfied: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    const next = applyMarkdownPatchToThread(
      thread,
      `---
title: "Gateway thread"
mission: "Ship the gateway"
status: ready
lane: research
---

Gateway root body
`,
      123,
    );

    expect(next.nextActions).toHaveLength(0);
    expect(next.waitingFor).toHaveLength(0);
    expect(next.rootMarkdown).toBe('Gateway root body');
  });
});
