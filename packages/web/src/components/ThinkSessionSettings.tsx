import type { ThinkSessionStartMode } from '@my-little-todo/core';
import { NotebookPen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSetting, putSetting } from '../storage/settingsApi';
import { WorkThreadSettingsSection } from './WorkThreadSettingsSection';

export type TaskRefRenderMode = 'inline-chip' | 'mini-card' | 'highlight-only';
export type ThinkSessionEditorDensity = 'balanced' | 'focused';

const KEY_TASK_REF_RENDER_MODE = 'think-session:task-ref-render-mode';
const KEY_DEFAULT_MODE = 'think-session:default-start-mode';
const KEY_SIDEBAR_OPEN = 'think-session:sidebar-default-open';
const KEY_EDITOR_DENSITY = 'think-session:editor-density';

export async function loadThinkSessionSettings(): Promise<{
  taskRefRenderMode: TaskRefRenderMode;
  defaultMode: ThinkSessionStartMode;
  sidebarDefaultOpen: boolean;
  editorDensity: ThinkSessionEditorDensity;
}> {
  const [taskRefRenderMode, defaultMode, sidebarDefaultOpen, editorDensity] = await Promise.all([
    getSetting(KEY_TASK_REF_RENDER_MODE),
    getSetting(KEY_DEFAULT_MODE),
    getSetting(KEY_SIDEBAR_OPEN),
    getSetting(KEY_EDITOR_DENSITY),
  ]);

  return {
    taskRefRenderMode:
      taskRefRenderMode === 'mini-card' || taskRefRenderMode === 'highlight-only'
        ? taskRefRenderMode
        : 'inline-chip',
    defaultMode:
      defaultMode === 'discovery' || defaultMode === 'arrange' || defaultMode === 'blank'
        ? defaultMode
        : 'blank',
    sidebarDefaultOpen: sidebarDefaultOpen !== 'false',
    editorDensity: editorDensity === 'focused' ? 'focused' : 'balanced',
  };
}

function Toggle({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
      }`}
    >
      <span
        className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function ThinkSessionSettings() {
  const [taskRefRenderMode, setTaskRefRenderMode] = useState<TaskRefRenderMode>('inline-chip');
  const [defaultMode, setDefaultMode] = useState<ThinkSessionStartMode>('blank');
  const [sidebarDefaultOpen, setSidebarDefaultOpen] = useState(true);
  const [editorDensity, setEditorDensity] = useState<ThinkSessionEditorDensity>('balanced');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadThinkSessionSettings().then((settings) => {
      setTaskRefRenderMode(settings.taskRefRenderMode);
      setDefaultMode(settings.defaultMode);
      setSidebarDefaultOpen(settings.sidebarDefaultOpen);
      setEditorDensity(settings.editorDensity);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return <p className="text-xs text-[var(--color-text-tertiary)]">Loading...</p>;
  }

  return (
    <div className="space-y-5">
      <section
        className="rounded-2xl border p-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
          >
            <NotebookPen size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Think Session</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              Control how light arrange and thread writing feel without splitting them into a different
              visual language.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">Task reference style</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ['inline-chip', 'Inline chip'],
              ['mini-card', 'Mini card'],
              ['highlight-only', 'Highlight only'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTaskRefRenderMode(id);
                  void putSetting(KEY_TASK_REF_RENDER_MODE, id);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: taskRefRenderMode === id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color: taskRefRenderMode === id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: `1px solid ${
                    taskRefRenderMode === id ? 'var(--color-accent)' : 'var(--color-border)'
                  }`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">Default writing mode</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ['blank', 'Free write'],
              ['discovery', 'Discovery'],
              ['arrange', 'Arrange'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setDefaultMode(id);
                  void putSetting(KEY_DEFAULT_MODE, id);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: defaultMode === id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color: defaultMode === id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: `1px solid ${defaultMode === id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Sidebar default open</p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              Keep the task/context sidebar visible when entering the session workspace.
            </p>
          </div>
          <Toggle
            checked={sidebarDefaultOpen}
            onToggle={() => {
              const next = !sidebarDefaultOpen;
              setSidebarDefaultOpen(next);
              void putSetting(KEY_SIDEBAR_OPEN, next ? 'true' : 'false');
            }}
          />
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">Editor density</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ['balanced', 'Balanced'],
              ['focused', 'Focused'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setEditorDensity(id);
                  void putSetting(KEY_EDITOR_DENSITY, id);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: editorDensity === id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color: editorDensity === id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: `1px solid ${editorDensity === id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <WorkThreadSettingsSection />
    </div>
  );
}
