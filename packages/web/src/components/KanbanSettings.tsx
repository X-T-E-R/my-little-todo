import { LayoutGrid } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('settings');
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
    return <p className="text-xs text-[var(--color-text-tertiary)]">{t('Loading...')}</p>;
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
            <h3 className="text-sm font-semibold text-[var(--color-text)]">
              {t('kanban_settings_title')}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              {t('kanban_settings_intro')}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('kanban_summary_density_label')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ['compact', t('kanban_summary_density_compact')],
              ['rich', t('kanban_summary_density_rich')],
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
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('kanban_empty_lane_label')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ['compressed', t('kanban_empty_lane_compressed')],
              ['full', t('kanban_empty_lane_full')],
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
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('kanban_done_rail_label')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ['rail', t('kanban_done_rail_compact')],
              ['expanded', t('kanban_done_rail_expanded')],
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
            <p className="text-sm font-medium text-[var(--color-text)]">
              {t('kanban_wip_warning_title')}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              {t('kanban_wip_warning_hint')}
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
