export type NowViewMode = 'task' | 'thread' | 'auto';
export type ThreadOpenMode = 'resume-last' | 'board-first';
export type RuntimeSidebarDefault = 'remember' | 'open' | 'closed';

export interface WorkThreadUiPrefs {
  nowDefaultView: NowViewMode;
  nowShowAutoView: boolean;
  threadOpenMode: ThreadOpenMode;
  materialSidebarDefaultOpen: boolean;
  runtimeSidebarDefault: RuntimeSidebarDefault;
}

export interface PartialWorkThreadUiPrefs {
  nowDefaultView?: unknown;
  nowShowAutoView?: unknown;
  threadOpenMode?: unknown;
  materialSidebarDefaultOpen?: unknown;
  runtimeSidebarDefault?: unknown;
}

export type InitialThreadRoute =
  | { kind: 'board' }
  | { kind: 'thread'; threadId: string };

export const NOW_DEFAULT_VIEW_KEY = 'work-thread:now-default-view';
export const NOW_SHOW_AUTO_VIEW_KEY = 'work-thread:now-show-auto-view';
export const THREAD_OPEN_MODE_KEY = 'work-thread:thread-open-mode';
export const MATERIAL_SIDEBAR_DEFAULT_OPEN_KEY = 'work-thread:material-sidebar-default-open';
export const THREAD_RUNTIME_SIDEBAR_DEFAULT_KEY = 'work-thread:thread-runtime-sidebar-default';
export const LAST_OPENED_THREAD_ID_KEY = 'work-thread:last-opened-thread-id';

export const LEGACY_NOW_DEFAULT_VIEW_KEY = 'think-session:now-default-view';
export const LEGACY_NOW_SHOW_AUTO_VIEW_KEY = 'think-session:now-show-auto-view';
export const LEGACY_THREAD_OPEN_MODE_KEY = 'think-session:thread-open-mode';
export const LEGACY_MATERIAL_SIDEBAR_DEFAULT_OPEN_KEY =
  'think-session:material-sidebar-default-open';
export const LEGACY_THREAD_RUNTIME_SIDEBAR_DEFAULT_KEY =
  'think-session:thread-runtime-sidebar-default';
export const LEGACY_LAST_OPENED_THREAD_ID_KEY = 'think-session:last-opened-thread-id';

export function resolveWorkThreadUiPrefs(
  raw: PartialWorkThreadUiPrefs,
): WorkThreadUiPrefs {
  return {
    nowDefaultView:
      raw.nowDefaultView === 'thread' || raw.nowDefaultView === 'auto'
        ? raw.nowDefaultView
        : 'auto',
    nowShowAutoView: raw.nowShowAutoView !== false,
    threadOpenMode: raw.threadOpenMode === 'board-first' ? 'board-first' : 'resume-last',
    materialSidebarDefaultOpen: raw.materialSidebarDefaultOpen !== false,
    runtimeSidebarDefault:
      raw.runtimeSidebarDefault === 'open' || raw.runtimeSidebarDefault === 'closed'
        ? raw.runtimeSidebarDefault
        : 'remember',
  };
}

export function getAvailableNowViews(
  prefs: Pick<WorkThreadUiPrefs, 'nowShowAutoView'>,
): NowViewMode[] {
  return prefs.nowShowAutoView ? ['auto', 'thread', 'task'] : ['thread', 'task'];
}

export function decideInitialThreadRoute({
  currentThreadId,
  lastOpenedThreadId,
  threadsCount,
  openMode,
}: {
  currentThreadId: string | null;
  lastOpenedThreadId: string | null;
  threadsCount: number;
  openMode: ThreadOpenMode;
}): InitialThreadRoute {
  if (currentThreadId) {
    return { kind: 'thread', threadId: currentThreadId };
  }
  if (openMode === 'resume-last' && lastOpenedThreadId) {
    return { kind: 'thread', threadId: lastOpenedThreadId };
  }
  if (threadsCount > 0 && openMode === 'resume-last' && !lastOpenedThreadId) {
    return { kind: 'board' };
  }
  return { kind: 'board' };
}
