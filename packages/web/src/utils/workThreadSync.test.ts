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
});
