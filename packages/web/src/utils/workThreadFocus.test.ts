import { createWorkThread } from '@my-little-todo/core';
import { describe, expect, it } from 'vitest';
import {
  appendMarkdownToFocusedThread,
  getWorkThreadFocusContainerPath,
  getWorkThreadFocusLabel,
  getWorkThreadFocusParent,
  normalizeWorkThreadFocus,
  resolveWorkThreadFocusByContainerPath,
  type WorkThreadWorkspaceFocus,
} from './workThreadFocus';

function sampleThread() {
  return {
    ...createWorkThread({ title: 'Gateway', mission: 'Ship gateway' }),
    intents: [
      {
        id: 'intent-1',
        text: '梳理网关方向',
        bodyMarkdown: '先看 Aether',
        collapsed: false,
        parentThreadId: 'thread-1',
        state: 'active' as const,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    sparkContainers: [
      {
        id: 'spark-1',
        title: '多 key 切换',
        bodyMarkdown: '后面再看',
        collapsed: false,
        parentThreadId: 'thread-1',
        createdAt: 2,
        updatedAt: 2,
      },
      {
        id: 'spark-2',
        title: '重复标题',
        bodyMarkdown: '根级 spark',
        collapsed: false,
        parentThreadId: 'thread-1',
        createdAt: 3,
        updatedAt: 3,
      },
      {
        id: 'spark-3',
        title: '重复标题',
        bodyMarkdown: 'intent 下的 spark',
        collapsed: false,
        parentThreadId: 'thread-1',
        parentIntentId: 'intent-1',
        createdAt: 4,
        updatedAt: 4,
      },
    ],
  };
}

describe('workThreadFocus', () => {
  it('resolves focus parent for focused containers', () => {
    expect(getWorkThreadFocusParent({ kind: 'root' })).toEqual({});
    expect(getWorkThreadFocusParent({ kind: 'intent', id: 'intent-1' })).toEqual({
      parentIntentId: 'intent-1',
    });
    expect(getWorkThreadFocusParent({ kind: 'spark', id: 'spark-1' })).toEqual({
      parentSparkId: 'spark-1',
    });
  });

  it('normalizes missing focus back to root', () => {
    const thread = sampleThread();
    expect(normalizeWorkThreadFocus(thread, { kind: 'intent', id: 'missing' })).toEqual({
      kind: 'root',
    });
  });

  it('appends markdown into the focused surface', () => {
    const thread = sampleThread();
    const intentThread = appendMarkdownToFocusedThread(thread, { kind: 'intent', id: 'intent-1' }, '补一条进展');
    expect(intentThread.intents[0]?.bodyMarkdown).toContain('补一条进展');

    const sparkThread = appendMarkdownToFocusedThread(thread, { kind: 'spark', id: 'spark-1' }, '补一个想法');
    expect(sparkThread.sparkContainers[0]?.bodyMarkdown).toContain('补一个想法');

    const explorationThread = appendMarkdownToFocusedThread(thread, { kind: 'exploration' }, 'https://example.com');
    expect(explorationThread.explorationMarkdown).toContain('example.com');
  });

  it('builds readable labels for the current focus', () => {
    const thread = sampleThread();
    const focus: WorkThreadWorkspaceFocus = { kind: 'intent', id: 'intent-1' };
    expect(getWorkThreadFocusLabel(thread, focus)).toContain('梳理网关方向');
  });

  it('resolves container paths back to stable ids', () => {
    const thread = sampleThread();
    expect(
      resolveWorkThreadFocusByContainerPath(thread, {
        kind: 'spark',
        containerPath: 'intent:0/spark:0',
      }),
    ).toMatchObject({
      kind: 'spark',
      id: 'spark-3',
    });
  });

  it('derives container paths from ids for doc insertion', () => {
    const thread = sampleThread();
    expect(getWorkThreadFocusContainerPath(thread, { kind: 'spark', id: 'spark-3' })).toBe(
      'intent:0/spark:0',
    );
  });
});
