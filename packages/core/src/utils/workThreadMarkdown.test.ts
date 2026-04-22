import { describe, expect, it, vi } from 'vitest';
import { parseWorkThreadMarkdown, serializeWorkThreadToMarkdown } from './workThreadMarkdown.js';
import { createWorkThread } from './workThreadRuntime.js';

function createPause(reason: string, thenText: string, updatedAt: number) {
  const pause = {
    reason,
    updatedAt,
  };
  // biome-ignore lint/suspicious/noThenProperty: Tests need the real `pause.then` shape.
  pause.then = thenText;
  return pause;
}

describe('workThreadMarkdown', () => {
  it('serializes and parses plugin-style callout markdown', () => {
    const thread = {
      ...createWorkThread({ title: 'Gateway', docMarkdown: 'Thread body note.' }),
      status: 'paused' as const,
      resume: 'Draft matrix',
      pause: createPause('Waiting for product answer', 'Sync wording after reply', 1713088800000),
      blocks: [
        {
          id: 'mission-1',
          kind: 'task' as const,
          taskAlias: 'mission' as const,
          title: 'Ship the gateway',
          body: 'Define the completion standard.',
          status: 'doing' as const,
          sortKey: 10,
          createdAt: 1,
          updatedAt: 2,
          resume: 'Confirm the finish line',
        },
        {
          id: 'task-1',
          kind: 'task' as const,
          taskAlias: 'task' as const,
          title: 'Draft matrix',
          body: 'Write the concrete action list.',
          status: 'todo' as const,
          sortKey: 20,
          createdAt: 3,
          updatedAt: 4,
          linkedTaskId: 'task-123',
        },
        {
          id: 'spark-1',
          kind: 'spark' as const,
          title: 'Release ideas',
          body: 'Collect side ideas.',
          sortKey: 30,
          createdAt: 5,
          updatedAt: 6,
        },
        {
          id: 'log-1',
          kind: 'log' as const,
          title: 'Checkpoint',
          body: 'Saved the latest snapshot.',
          sortKey: 40,
          createdAt: 7,
          updatedAt: 8,
          promotedStreamEntryId: 'stream-1',
        },
      ],
    };

    const markdown = serializeWorkThreadToMarkdown(thread);
    expect(markdown).toContain('> [!mission] Ship the gateway');
    expect(markdown).toContain('> [!task] Draft matrix');
    expect(markdown).toContain('> [!spark] Release ideas');
    expect(markdown).toContain('> [!log] Checkpoint');
    expect(markdown).toContain('<!-- mlt-meta:');
    expect(markdown).toContain('"sortKey":10');
    expect(markdown).toContain('"status":"doing"');
    expect(markdown).toContain('^mission-1');
    expect(markdown).toContain('^log-1');

    const parsed = parseWorkThreadMarkdown(markdown);
    expect(parsed.frontmatter.title).toBe('Gateway');
    expect(parsed.frontmatter.status).toBe('paused');
    expect(parsed.frontmatter.resume).toBe('Draft matrix');
    expect(parsed.frontmatter.pauseReason).toBe('Waiting for product answer');
    expect(parsed.frontmatter.pauseThen).toBe('Sync wording after reply');
    expect(parsed.bodyMarkdown).toBe('Thread body note.');
    expect(parsed.blocks).toHaveLength(4);
    expect(parsed.blocks[0]).toMatchObject({
      id: 'mission-1',
      kind: 'task',
      taskAlias: 'mission',
      title: 'Ship the gateway',
      body: 'Define the completion standard.',
      status: 'doing',
      resume: 'Confirm the finish line',
      sortKey: 10,
    });
    expect(parsed.blocks[1]).toMatchObject({
      id: 'task-1',
      kind: 'task',
      taskAlias: 'task',
      title: 'Draft matrix',
      body: 'Write the concrete action list.',
      linkedTaskId: 'task-123',
      sortKey: 20,
    });
    expect(parsed.blocks[2]).toMatchObject({
      id: 'spark-1',
      kind: 'spark',
      title: 'Release ideas',
      body: 'Collect side ideas.',
      sortKey: 30,
    });
    expect(parsed.blocks[3]).toMatchObject({
      id: 'log-1',
      kind: 'log',
      title: 'Checkpoint',
      body: 'Saved the latest snapshot.',
      promotedStreamEntryId: 'stream-1',
      sortKey: 40,
    });
  });

  it('detects callout blocks after a normal thread body section', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T10:00:00Z'));

    const parsed = parseWorkThreadMarkdown(`---
title: "Gateway thread"
status: paused
resume: "Draft matrix"
pause.reason: "Waiting for product answer"
pause.then: "Sync wording after reply"
---

Thread body note.

> [!mission] Ship the gateway
> <!-- mlt-meta: {"sortKey":0,"status":"doing"} -->
>
> Define the completion standard.
^mission-1

> [!task] Draft matrix
> <!-- mlt-meta: {"sortKey":1,"status":"todo"} -->
>
> Write the concrete action list.
^task-1

> [!spark] Release ideas
> <!-- mlt-meta: {"sortKey":2} -->
>
> Collect side ideas.
^spark-1
`);

    expect(parsed.bodyMarkdown).toBe('Thread body note.');
    expect(parsed.blocks).toHaveLength(3);
    expect(parsed.blocks[0]).toMatchObject({
      id: 'mission-1',
      kind: 'task',
      taskAlias: 'mission',
      title: 'Ship the gateway',
      status: 'doing',
      sortKey: 0,
    });
    expect(parsed.blocks[1]).toMatchObject({
      id: 'task-1',
      kind: 'task',
      taskAlias: 'task',
      title: 'Draft matrix',
      status: 'todo',
      sortKey: 1,
    });
    expect(parsed.blocks[2]).toMatchObject({
      id: 'spark-1',
      kind: 'spark',
      title: 'Release ideas',
      sortKey: 2,
    });

    vi.useRealTimers();
  });

  it('treats plain markdown as thread body when no native blocks exist', () => {
    const parsed = parseWorkThreadMarkdown(`---
title: "Gateway thread"
status: active
---

Gateway root body

- plain note
`);

    expect(parsed.frontmatter.title).toBe('Gateway thread');
    expect(parsed.frontmatter.status).toBe('active');
    expect(parsed.blocks).toEqual([]);
    expect(parsed.bodyMarkdown).toBe('Gateway root body\n\n- plain note');
    expect(parsed.rootMarkdown).toBe('Gateway root body\n\n- plain note');
  });

  it('still parses legacy slash blocks for backwards compatibility', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T08:00:00Z'));

    const parsed = parseWorkThreadMarkdown(`/task
id: task-1
sortKey: 5
title: Draft matrix
status: todo

Update the matrix draft.
`);

    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]).toMatchObject({
      id: 'task-1',
      kind: 'task',
      taskAlias: 'task',
      title: 'Draft matrix',
      status: 'todo',
      sortKey: 5,
    });

    vi.useRealTimers();
  });

  it('keeps task-level pause metadata on parsed callout blocks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T08:30:00Z'));

    const parsed = parseWorkThreadMarkdown(`> [!task] Draft matrix
> <!-- mlt-meta: {"sortKey":5,"status":"doing","resume":"Check open questions","pause":{"reason":"Waiting for design feedback","then":"Resume after the mock is confirmed"}} -->
>
> Update the matrix draft.
^task-1
`);

    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]).toMatchObject({
      id: 'task-1',
      kind: 'task',
      taskAlias: 'task',
      title: 'Draft matrix',
      status: 'doing',
      resume: 'Check open questions',
      sortKey: 5,
      pause: createPause(
        'Waiting for design feedback',
        'Resume after the mock is confirmed',
        Date.now(),
      ),
    });

    vi.useRealTimers();
  });
});
