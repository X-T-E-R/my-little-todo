import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Pin, StickyNote } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSetting, putSetting } from '../storage/settingsApi';
import { useRoleStore, useStreamStore, useTaskStore } from '../stores';
import { useWindowContextStore } from '../stores/windowContextStore';
import type { WidgetDisplayMode } from '../utils/desktopWidget';
import { WidgetCapture } from './widget/WidgetCapture';
import { WidgetQuickInput } from './widget/WidgetQuickInput';
import { type WidgetRoleMode, WidgetRoleSelect } from './widget/WidgetRoleSelect';
import { WidgetStream } from './widget/WidgetStream';
import { WidgetTasks } from './widget/WidgetTasks';

const MODE_KEY = 'plugin:desktop-widget:display-mode';

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 6) return 'greeting_night';
  if (h < 12) return 'greeting_morning';
  if (h < 18) return 'greeting_afternoon';
  return 'greeting_evening';
}

type TabKey = 'tasks' | 'capture' | 'stream';

export function WidgetView() {
  const { t } = useTranslation('widget');
  const tasks = useTaskStore((s) => s.tasks);
  const loadTasks = useTaskStore((s) => s.load);
  const roles = useRoleStore((s) => s.roles);
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const matched = useWindowContextStore((s) => s.matched);
  const entries = useStreamStore((s) => s.entries);
  const loadStream = useStreamStore((s) => s.load);

  const [mode, setMode] = useState<WidgetDisplayMode>('overlay');
  const [hovered, setHovered] = useState(false);
  const [tab, setTab] = useState<TabKey>('tasks');
  const [roleMode, setRoleMode] = useState<WidgetRoleMode>('auto');

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadStream();
  }, [loadStream]);

  useEffect(() => {
    void (async () => {
      const v = await getSetting(MODE_KEY);
      if (v === 'pin' || v === 'overlay') setMode(v);
    })();
  }, []);

  const effectiveRoleIds = useMemo((): string[] | null => {
    if (roleMode === 'all') return null;
    if (roleMode === 'auto') {
      if (matched?.roleIds?.length) return matched.roleIds;
      if (currentRoleId) return [currentRoleId];
      return null;
    }
    return [roleMode];
  }, [roleMode, matched, currentRoleId]);

  const primaryRoleForInput = useMemo(() => {
    if (effectiveRoleIds?.length) return effectiveRoleIds[0];
    return currentRoleId ?? undefined;
  }, [effectiveRoleIds, currentRoleId]);

  const setDisplayMode = useCallback(async (m: WidgetDisplayMode) => {
    setMode(m);
    await putSetting(MODE_KEY, m);
    try {
      const win = getCurrentWebviewWindow();
      await win.setAlwaysOnTop(m === 'overlay');
    } catch {
      /* */
    }
  }, []);

  const refreshData = useCallback(() => {
    void loadTasks();
    void loadStream();
  }, [loadTasks, loadStream]);

  const contextHint =
    roleMode === 'auto' && matched?.processName?.trim()
      ? t('widget_auto_matched', { process: matched.processName })
      : null;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl transition-all duration-200"
      style={
        {
          WebkitAppRegion: 'drag',
          background: hovered
            ? 'color-mix(in oklab, var(--color-surface) 90%, transparent)'
            : 'color-mix(in oklab, var(--color-surface) 75%, transparent)',
          backdropFilter: hovered ? 'blur(16px)' : 'blur(24px)',
          WebkitBackdropFilter: hovered ? 'blur(16px)' : 'blur(24px)',
          border: '1px solid color-mix(in oklab, var(--color-border) 50%, transparent)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
        } as React.CSSProperties
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <header
        className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2"
        data-tauri-drag-region
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <WidgetRoleSelect roles={roles} value={roleMode} onChange={setRoleMode} />
          <span className="text-[10px] text-[var(--color-text-tertiary)]">{t(greetingKey())}</span>
        </div>
        <div
          className="flex shrink-0 gap-0.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            type="button"
            title={t('mode_overlay')}
            onClick={() => void setDisplayMode('overlay')}
            className="rounded-md p-1 transition-colors duration-150"
            style={{
              color: mode === 'overlay' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              background:
                mode === 'overlay'
                  ? 'color-mix(in oklab, var(--color-accent) 12%, transparent)'
                  : 'transparent',
            }}
          >
            <StickyNote size={13} />
          </button>
          <button
            type="button"
            title={t('mode_pin')}
            onClick={() => void setDisplayMode('pin')}
            className="rounded-md p-1 transition-colors duration-150"
            style={{
              color: mode === 'pin' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              background:
                mode === 'pin'
                  ? 'color-mix(in oklab, var(--color-accent) 12%, transparent)'
                  : 'transparent',
            }}
          >
            <Pin size={13} />
          </button>
        </div>
      </header>

      {contextHint && (
        <p className="truncate px-3 text-[10px] text-[var(--color-text-tertiary)]">{contextHint}</p>
      )}

      <nav
        className="flex shrink-0 gap-1 border-b border-[var(--color-border)] px-2 py-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {(['tasks', 'capture', 'stream'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-md px-2 py-1 text-[11px] font-medium ${
              tab === k
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]'
            }`}
          >
            {k === 'tasks'
              ? t('widget_tab_tasks')
              : k === 'capture'
                ? t('widget_tab_capture')
                : t('widget_tab_stream')}
          </button>
        ))}
      </nav>

      <div
        className="min-h-0 flex-1 overflow-hidden px-2 py-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {tab === 'tasks' && (
          <WidgetTasks tasks={tasks} effectiveRoleIds={effectiveRoleIds} filterMode={roleMode} />
        )}
        {tab === 'capture' && (
          <WidgetCapture primaryRoleId={primaryRoleForInput} onSubmitted={refreshData} />
        )}
        {tab === 'stream' && <WidgetStream entries={entries} />}
      </div>

      <WidgetQuickInput primaryRoleId={primaryRoleForInput} onSubmitted={refreshData} />
    </div>
  );
}
