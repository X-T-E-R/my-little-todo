import type { WindowContext } from '@my-little-todo/core';
import { displayTaskTitle, taskRoleIds } from '@my-little-todo/core';
import type { Task } from '@my-little-todo/core';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { ChevronRight, Minimize2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoleStore, useStreamStore, useTaskStore } from '../stores';
import { useWindowContextStore } from '../stores/windowContextStore';

type TargetPayload = {
  title: string;
  processName?: string | null;
  processId: number;
};

type PanelMode = 'full' | 'mini';

function normProcess(name: string | undefined | null): string {
  return (name ?? '').trim().toLowerCase();
}

function pickTasksForRoles(tasks: Task[], roleIds: string[], limit: number): Task[] {
  const open = tasks.filter((t) => t.status === 'active' || t.status === 'today');
  const filtered =
    roleIds.length === 0
      ? open
      : open.filter((t) => {
          const tr = taskRoleIds(t);
          if (tr.length === 0) return false;
          return tr.some((id) => roleIds.includes(id));
        });
  const sorted = [...filtered].sort((a, b) => {
    const ad = a.ddl?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bd = b.ddl?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });
  return sorted.slice(0, limit);
}

function findContextMatch(
  contexts: WindowContext[],
  processName: string | undefined | null,
): WindowContext | null {
  const n = normProcess(processName);
  if (!n) return null;
  return contexts.find((c) => normProcess(c.processName) === n) ?? null;
}

function noteSummary(note: string | undefined, maxLen: number): string {
  const line = (note ?? '').split('\n')[0]?.trim() ?? '';
  if (line.length <= maxLen) return line;
  return `${line.slice(0, maxLen)}…`;
}

export function AnnotatorPanel() {
  const { t } = useTranslation('widget');
  const roles = useRoleStore((s) => s.roles);
  const tasks = useTaskStore((s) => s.tasks);
  const loadTasks = useTaskStore((s) => s.load);
  const streamEntries = useStreamStore((s) => s.entries);
  const loadStream = useStreamStore((s) => s.load);

  const loadContexts = useWindowContextStore((s) => s.loadContexts);
  const putContext = useWindowContextStore((s) => s.putContext);
  const foreground = useWindowContextStore((s) => s.foreground);
  const addEntry = useStreamStore((s) => s.addEntry);

  const [target, setTarget] = useState<TargetPayload | null>(null);
  const [draft, setDraft] = useState<WindowContext | null>(null);
  const [quick, setQuick] = useState('');
  const [panelMode, setPanelMode] = useState<PanelMode>('full');
  const [quickFeedback, setQuickFeedback] = useState<string | null>(null);
  const noteInputId = 'annotator-note-input';
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<WindowContext | null>(null);
  const lastMiniFgKeyRef = useRef<string>('');
  draftRef.current = draft;

  const resizeForMode = useCallback(async (mode: PanelMode) => {
    try {
      const w = getCurrentWebviewWindow();
      if (mode === 'mini') {
        await w.setSize(new LogicalSize(360, 44));
      } else {
        await w.setSize(new LogicalSize(400, 560));
      }
    } catch {
      /* non-Tauri / permission */
    }
  }, []);

  useEffect(() => {
    void resizeForMode(panelMode);
  }, [panelMode, resizeForMode]);

  const hideWindow = useCallback(async () => {
    try {
      const w = getCurrentWebviewWindow();
      await w.hide();
    } catch {
      /* */
    }
  }, []);

  const applyTarget = useCallback(
    async (p: TargetPayload, opts?: { openFull?: boolean }) => {
      const openFull = opts?.openFull ?? true;
      setTarget(p);
      await loadContexts();
      let existing = findContextMatch(useWindowContextStore.getState().contexts, p.processName);
      const now = new Date();
      if (!existing) {
        const proc = p.processName?.trim() || '';
        const title = (p.title ?? '').slice(0, 120);
        const newCtx: WindowContext = {
          id: crypto.randomUUID(),
          processName: proc || undefined,
          displayName: proc || undefined,
          titlePattern: title || undefined,
          matchMode: 'contains',
          roleIds: [],
          note: '',
          createdAt: now,
          updatedAt: now,
        };
        await putContext(newCtx);
        await loadContexts();
        existing = findContextMatch(useWindowContextStore.getState().contexts, p.processName);
      }
      if (existing) {
        setDraft({ ...existing });
      }
      lastMiniFgKeyRef.current = `${p.processId}:${normProcess(p.processName)}`;
      if (openFull) {
        setPanelMode('full');
      }
    },
    [loadContexts, putContext],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listen<TargetPayload>('annotator-target', (ev) => {
        void applyTarget(ev.payload, { openFull: true });
      });
    })();
    return () => {
      unlisten?.();
    };
  }, [applyTarget]);

  /** 切换到迷你条前立即落盘备注（避免 debounce 丢失） */
  useEffect(() => {
    if (panelMode !== 'mini') return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      const d = draftRef.current;
      if (d) void putContext({ ...d, updatedAt: new Date() });
    }
  }, [panelMode, putContext]);

  /** 迷你模式：前台窗口变化时同步标注内容 */
  useEffect(() => {
    if (panelMode !== 'mini' || !foreground) return;
    const key = `${foreground.processId}:${normProcess(foreground.processName)}`;
    if (lastMiniFgKeyRef.current === key) return;
    void applyTarget(
      {
        title: foreground.title,
        processName: foreground.processName,
        processId: foreground.processId,
      },
      { openFull: false },
    );
  }, [panelMode, foreground, applyTarget]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadStream();
  }, [loadStream]);

  const scheduleSave = useCallback(
    (next: WindowContext) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void putContext({ ...next, updatedAt: new Date() });
      }, 300);
    },
    [putContext],
  );

  const updateDraft = useCallback(
    (patch: Partial<WindowContext>) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const merged = { ...prev, ...patch, updatedAt: new Date() };
        scheduleSave(merged);
        return merged;
      });
    },
    [scheduleSave],
  );

  const toggleRole = useCallback(
    async (roleId: string) => {
      if (!draft) return;
      const has = draft.roleIds.includes(roleId);
      const roleIds = has
        ? draft.roleIds.filter((id) => id !== roleId)
        : [...draft.roleIds, roleId];
      const merged = { ...draft, roleIds, updatedAt: new Date() };
      setDraft(merged);
      await putContext(merged);
    },
    [draft, putContext],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!draft || !target) {
        void hideWindow();
        return;
      }
      if (panelMode === 'full') {
        setPanelMode('mini');
        return;
      }
      void hideWindow();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, target, panelMode, hideWindow]);

  const shownTasks = useMemo(
    () => pickTasksForRoles(tasks, draft?.roleIds ?? [], 8),
    [tasks, draft?.roleIds],
  );

  const recentStream = useMemo(() => {
    return [...streamEntries]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 3);
  }, [streamEntries]);

  const primaryRoleColor = useMemo(() => {
    const id = draft?.roleIds[0];
    if (!id) return 'var(--color-text-tertiary)';
    return roles.find((r) => r.id === id)?.color ?? 'var(--color-accent)';
  }, [draft?.roleIds, roles]);

  const submitQuick = async () => {
    const line = quick.trim();
    if (!line) return;
    const primaryRole = draft?.roleIds[0];
    await addEntry(line, true, { roleId: primaryRole });
    setQuick('');
    void loadTasks();
    void loadStream();
    setQuickFeedback(t('annotator_quick_recorded'));
    if (quickFeedbackTimerRef.current) clearTimeout(quickFeedbackTimerRef.current);
    quickFeedbackTimerRef.current = setTimeout(() => setQuickFeedback(null), 1500);
  };

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (quickFeedbackTimerRef.current) clearTimeout(quickFeedbackTimerRef.current);
    };
  }, []);

  const headerTitle =
    draft?.displayName?.trim() || draft?.processName?.trim() || t('annotator_unknown_app');
  const titleLine = target?.title?.trim() || '—';
  const noteLine = noteSummary(draft?.note, 40);

  if (!draft || !target) {
    return (
      <div
        className="flex h-full min-h-0 flex-col rounded-2xl border border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-surface)_92%,transparent)] p-4 shadow-lg backdrop-blur-md"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <p className="text-xs text-[var(--color-text-secondary)]">{t('annotator_waiting')}</p>
      </div>
    );
  }

  if (panelMode === 'mini') {
    return (
      <button
        type="button"
        className="flex h-full w-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-surface)_92%,transparent)] px-2 py-1 text-left shadow-lg backdrop-blur-md"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={() => setPanelMode('full')}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: primaryRoleColor }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--color-text)]">
          {headerTitle}
          <span className="text-[var(--color-text-tertiary)]"> · </span>
          <span className="font-normal text-[var(--color-text-secondary)]">
            {noteLine || t('annotator_mini_no_note')}
          </span>
        </span>
        <span className="shrink-0 rounded-md bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
          {t('annotator_mini_tasks_badge', { count: shownTasks.length })}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" aria-hidden />
      </button>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-surface)_92%,transparent)] shadow-lg backdrop-blur-md"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <header
        className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2"
        data-tauri-drag-region
      >
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[var(--color-text)]">{headerTitle}</p>
          <p
            className="mt-0.5 line-clamp-2 text-[10px] text-[var(--color-text-tertiary)]"
            title={titleLine}
          >
            {titleLine}
          </p>
        </div>
        <div
          className="flex shrink-0 items-center gap-0.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            type="button"
            className="rounded-lg p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
            onClick={() => setPanelMode('mini')}
            title={t('annotator_collapse_mini')}
            aria-label={t('annotator_collapse_mini')}
          >
            <Minimize2 size={16} />
          </button>
          <button
            type="button"
            className="rounded-lg p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
            onClick={() => void hideWindow()}
            title={t('annotator_hide')}
            aria-label={t('annotator_hide')}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <label
          htmlFor={noteInputId}
          className="block text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]"
        >
          {t('annotator_note')}
        </label>
        <textarea
          id={noteInputId}
          className="mt-1 w-full min-h-[72px] resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-text)]"
          value={draft.note}
          onChange={(e) => updateDraft({ note: e.target.value })}
          placeholder={t('annotator_note_ph')}
        />

        <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {t('annotator_roles')}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {roles.map((r) => {
            const on = draft.roleIds.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => void toggleRole(r.id)}
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  on
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)]'
                }`}
              >
                {r.name}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {t('annotator_tasks_for_roles', { count: shownTasks.length })}
        </p>
        <ul className="mt-1 space-y-1">
          {shownTasks.map((task) => (
            <li key={task.id} className="truncate text-[11px] text-[var(--color-text)]">
              — {displayTaskTitle(task)}
            </li>
          ))}
        </ul>
        {shownTasks.length === 0 && (
          <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
            {t('annotator_no_tasks')}
          </p>
        )}

        <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {t('annotator_recent_stream')}
        </p>
        {quickFeedback && (
          <p className="mt-1 text-[11px] text-[var(--color-accent)]">{quickFeedback}</p>
        )}
        <ul className="mt-1 space-y-0.5">
          {recentStream.map((e) => (
            <li key={e.id} className="line-clamp-2 text-[11px] text-[var(--color-text-secondary)]">
              {e.content}
            </li>
          ))}
        </ul>
        {recentStream.length === 0 && !quickFeedback && (
          <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
            {t('annotator_stream_empty_hint')}
          </p>
        )}
      </div>

      <footer
        className="shrink-0 border-t border-[var(--color-border)] px-3 py-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submitQuick();
            }
          }}
          placeholder={t('annotator_quick_placeholder')}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-text)]"
        />
      </footer>
    </div>
  );
}
