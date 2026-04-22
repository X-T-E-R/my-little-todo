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
status: paused
resume: "Draft matrix"
pause.reason: "Waiting for product answer"
pause.then: "Sync wording after reply"
---

Thread body note.

/mission
title: Ship the gateway
status: doing

Define the completion standard.

/task
title: Draft matrix
status: todo

Write the concrete action list.

/spark
title: Release ideas

Collect side ideas.
`,
      123,
    );
    expect(next.title).toBe('Gateway thread');
    expect(next.resume).toBe('Draft matrix');
    expect(next.pause?.reason).toBe('Waiting for product answer');
    expect(next.blocks).toHaveLength(3);
    expect(next.syncMeta?.lastExternalModifiedAt).toBe(123);
    vi.useRealTimers();
  });

  it('treats plain markdown body as thread body when no native blocks exist', () => {
    const thread = {
      ...createWorkThread({ title: 'Gateway' }),
      blocks: [
        {
          id: 'block-1',
          kind: 'task' as const,
          taskAlias: 'task' as const,
          title: 'Old block',
          body: 'Old body',
          sortKey: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    const next = applyMarkdownPatchToThread(
      thread,
      `---
title: "Gateway thread"
status: active
---

Gateway root body
`,
      123,
    );

    expect(next.blocks).toHaveLength(0);
    expect(next.bodyMarkdown).toBe('Gateway root body');
    expect(next.rootMarkdown).toBe('Gateway root body');
  });
});
