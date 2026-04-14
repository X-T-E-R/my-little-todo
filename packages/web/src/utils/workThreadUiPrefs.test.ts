import { describe, expect, it } from 'vitest';
import {
  decideInitialThreadRoute,
  getAvailableNowViews,
  resolveWorkThreadUiPrefs,
} from './workThreadUiPrefs';

describe('resolveWorkThreadUiPrefs', () => {
  it('falls back to editor-centered defaults when settings are missing', () => {
    const prefs = resolveWorkThreadUiPrefs({});

    expect(prefs.nowDefaultView).toBe('task');
    expect(prefs.nowShowAutoView).toBe(true);
    expect(prefs.threadOpenMode).toBe('resume-last');
    expect(prefs.materialSidebarDefaultOpen).toBe(true);
    expect(prefs.runtimeSidebarDefault).toBe('remember');
  });

  it('keeps only supported values from persisted settings', () => {
    const prefs = resolveWorkThreadUiPrefs({
      nowDefaultView: 'thread',
      nowShowAutoView: false,
      threadOpenMode: 'board-first',
      materialSidebarDefaultOpen: false,
      runtimeSidebarDefault: 'open',
    });

    expect(prefs).toMatchObject({
      nowDefaultView: 'thread',
      nowShowAutoView: false,
      threadOpenMode: 'board-first',
      materialSidebarDefaultOpen: false,
      runtimeSidebarDefault: 'open',
    });
  });
});

describe('getAvailableNowViews', () => {
  it('hides the auto tab when the preference disables it', () => {
    const views = getAvailableNowViews(
      resolveWorkThreadUiPrefs({
        nowShowAutoView: false,
      }),
    );

    expect(views).toEqual(['task', 'thread']);
  });

  it('keeps task, thread, and auto when auto view is enabled', () => {
    const views = getAvailableNowViews(resolveWorkThreadUiPrefs({}));
    expect(views).toEqual(['task', 'thread', 'auto']);
  });
});

describe('decideInitialThreadRoute', () => {
  it('prefers the current thread when one is already open', () => {
    const route = decideInitialThreadRoute({
      currentThreadId: 'current-thread',
      lastOpenedThreadId: 'old-thread',
      threadsCount: 3,
      openMode: 'resume-last',
    });

    expect(route).toEqual({ kind: 'thread', threadId: 'current-thread' });
  });

  it('reuses the last opened thread when resume-last is enabled', () => {
    const route = decideInitialThreadRoute({
      currentThreadId: null,
      lastOpenedThreadId: 'remembered-thread',
      threadsCount: 3,
      openMode: 'resume-last',
    });

    expect(route).toEqual({ kind: 'thread', threadId: 'remembered-thread' });
  });

  it('falls back to the board when the preference is board-first', () => {
    const route = decideInitialThreadRoute({
      currentThreadId: null,
      lastOpenedThreadId: 'remembered-thread',
      threadsCount: 3,
      openMode: 'board-first',
    });

    expect(route).toEqual({ kind: 'board' });
  });

  it('falls back to the board when nothing can be resumed', () => {
    const route = decideInitialThreadRoute({
      currentThreadId: null,
      lastOpenedThreadId: null,
      threadsCount: 0,
      openMode: 'resume-last',
    });

    expect(route).toEqual({ kind: 'board' });
  });
});
