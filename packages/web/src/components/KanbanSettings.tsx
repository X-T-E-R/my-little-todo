import { LayoutGrid } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSetting, putSetting } from '../storage/settingsApi';

export type KanbanSummaryDensity = 'compact' | 'rich';
export type KanbanEmptyLaneMode = 'compressed' | 'full';
export type KanbanDoneRailMode = 'rail' | 'expanded';

const KEY_SUMMARY_DENSITY = 'kanban:fullscreen-summary-density';
const KEY_EMPTY_LANES = 'kanban:empty-lanes';
const KEY_DONE_RAIL = 'kanban:done-rail-mode';
const KEY_SHOW_WIP_ALERT = 'kanban:show-wip-alert';

export async function loadKanbanSettings(): Promise<{
  summaryDensity: KanbanSummaryDensity;
  emptyLaneMode: KanbanEmptyLaneMode;
  doneRailMode: KanbanDoneRailMode;
  showWipAlert: boolean;
}> {
  const [summaryDensity, emptyLaneMode, doneRailMode, showWipAlert] = await Promise.all([
    getSetting(KEY_SUMMARY_DENSITY),
    getSetting(KEY_EMPTY_LANES),
    getSetting(KEY_DONE_RAIL),
    getSetting(KEY_SHOW_WIP_ALERT),
  ]);

  return {
    summaryDensity: summaryDensity === 'compact' ? 'compact' : 'rich',
    emptyLaneMode: emptyLaneMode === 'full' ? 'full' : 'compressed',
    doneRailMode: doneRailMode === 'expanded' ? 'expanded' : 'rail',
    showWipAlert: showWipAlert !== 'false',
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

export function KanbanSettings() {
  const [summaryDensity, setSummaryDensity] = useState<KanbanSummaryDensity>('rich');
  const [emptyLaneMode, setEmptyLaneMode] = useState<KanbanEmptyLaneMode>('compressed');
  const [doneRailMode, setDoneRailMode] = useState<KanbanDoneRailMode>('rail');
  const [showWipAlert, setShowWipAlert] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadKanbanSettings().then((settings) => {
      setSummaryDensity(settings.summaryDensity);
      setEmptyLaneMode(settings.emptyLaneMode);
      setDoneRailMode(settings.doneRailMode);
      setShowWipAlert(settings.showWipAlert);
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
            <LayoutGrid size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Kanban board</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              Tune how the embedded board and fullscreen overview balance execution and summary.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">Fullscreen summary density</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ['compact', 'Compact'],
              ['rich', 'Rich'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSummaryDensity(id);
                  void putSetting(KEY_SUMMARY_DENSITY, id);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: summaryDensity === id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color: summaryDensity === id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: `1px solid ${summaryDensity === id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">Empty lane behavior</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ['compressed', 'Compress empty lanes'],
              ['full', 'Keep full-width lanes'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setEmptyLaneMode(id);
                  void putSetting(KEY_EMPTY_LANES, id);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: emptyLaneMode === id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color: emptyLaneMode === id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: `1px solid ${emptyLaneMode === id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">Done rail in fullscreen</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ['rail', 'Compact rail'],
              ['expanded', 'Expanded review'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setDoneRailMode(id);
                  void putSetting(KEY_DONE_RAIL, id);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: doneRailMode === id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color: doneRailMode === id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: `1px solid ${doneRailMode === id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="flex items-start justify-between gap-4 rounded-2xl border px-4 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Show WIP pressure warning</p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              Highlight the doing lane when it moves beyond the configured WIP limit.
            </p>
          </div>
          <Toggle
            checked={showWipAlert}
            onToggle={() => {
              const next = !showWipAlert;
              setShowWipAlert(next);
              void putSetting(KEY_SHOW_WIP_ALERT, next ? 'true' : 'false');
            }}
          />
        </div>
      </section>
    </div>
  );
}
