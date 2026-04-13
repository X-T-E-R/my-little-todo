import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSetting, putSetting } from '../storage/settingsApi';

const KEY_SHOW_PROJECTS = 'stream-context-panel:show-projects';
const KEY_SHOW_TODAY = 'stream-context-panel:show-today';
const KEY_SHOW_TAGS = 'stream-context-panel:show-tags';
const KEY_SHOW_COMPLETED = 'stream-context-panel:show-completed';
const KEY_PANEL_WIDTH = 'stream-context-panel:panel-width';
const KEY_SORT_MODE = 'stream-context-panel:sort-mode';
const KEY_PANEL_DENSITY = 'stream-context-panel:density';

export type StreamContextPanelWidth = 'compact' | 'normal' | 'wide';
export type StreamContextPanelSortMode = 'smart' | 'recent' | 'due';
export type StreamContextPanelDensity = 'airy' | 'balanced' | 'dense';

export async function loadStreamContextPanelSettings(): Promise<{
  showProjects: boolean;
  showToday: boolean;
  showTags: boolean;
  showCompleted: boolean;
  panelWidth: StreamContextPanelWidth;
  sortMode: StreamContextPanelSortMode;
  density: StreamContextPanelDensity;
}> {
  const [sp, st, sg, sc, pw, sortMode, density] = await Promise.all([
    getSetting(KEY_SHOW_PROJECTS),
    getSetting(KEY_SHOW_TODAY),
    getSetting(KEY_SHOW_TAGS),
    getSetting(KEY_SHOW_COMPLETED),
    getSetting(KEY_PANEL_WIDTH),
    getSetting(KEY_SORT_MODE),
    getSetting(KEY_PANEL_DENSITY),
  ]);
  return {
    showProjects: sp !== 'false',
    showToday: st !== 'false',
    showTags: sg !== 'false',
    showCompleted: sc === 'true',
    panelWidth: pw === 'compact' || pw === 'wide' || pw === 'normal' ? pw : 'normal',
    sortMode: sortMode === 'recent' || sortMode === 'due' || sortMode === 'smart' ? sortMode : 'smart',
    density: density === 'airy' || density === 'dense' || density === 'balanced' ? density : 'balanced',
  };
}

function ChoiceRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: readonly { id: T; label: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: value === option.id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
              color: value === option.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              border: `1px solid ${
                value === option.id ? 'var(--color-accent)' : 'var(--color-border)'
              }`,
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--color-accent)]"
      />
    </label>
  );
}

export function StreamContextPanelSettings() {
  const { t } = useTranslation('settings');
  const [showProjects, setShowProjects] = useState(true);
  const [showToday, setShowToday] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [panelWidth, setPanelWidth] = useState<StreamContextPanelWidth>('normal');
  const [sortMode, setSortMode] = useState<StreamContextPanelSortMode>('smart');
  const [density, setDensity] = useState<StreamContextPanelDensity>('balanced');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadStreamContextPanelSettings().then((settings) => {
      setShowProjects(settings.showProjects);
      setShowToday(settings.showToday);
      setShowTags(settings.showTags);
      setShowCompleted(settings.showCompleted);
      setPanelWidth(settings.panelWidth);
      setSortMode(settings.sortMode);
      setDensity(settings.density);
      setReady(true);
    });
  }, []);

  const persistBool = async (
    setter: (value: boolean) => void,
    key: string,
    value: boolean,
  ) => {
    setter(value);
    await putSetting(key, value ? 'true' : 'false');
  };

  if (!ready) {
    return <p className="text-xs text-[var(--color-text-tertiary)]">{t('Loading...')}</p>;
  }

  return (
    <div className="space-y-5 text-sm text-[var(--color-text)]">
      <section
        className="rounded-[var(--radius-panel)] border p-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <p className="text-sm font-semibold text-[var(--color-text)]">Stream context panel</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          Choose what shows up in the side panel, how tightly it packs information, and what it
          prioritizes first.
        </p>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-medium text-[var(--color-text-secondary)]">
          {t('stream_context_panel_sections')}
        </p>
        <ToggleRow
          label={t('stream_context_show_projects')}
          checked={showProjects}
          onChange={(value) => void persistBool(setShowProjects, KEY_SHOW_PROJECTS, value)}
        />
        <ToggleRow
          label={t('stream_context_show_today')}
          checked={showToday}
          onChange={(value) => void persistBool(setShowToday, KEY_SHOW_TODAY, value)}
        />
        <ToggleRow
          label={t('stream_context_show_tags')}
          checked={showTags}
          onChange={(value) => void persistBool(setShowTags, KEY_SHOW_TAGS, value)}
        />
        <ToggleRow
          label="Show completed tasks"
          checked={showCompleted}
          onChange={(value) => void persistBool(setShowCompleted, KEY_SHOW_COMPLETED, value)}
        />
      </section>

      <section className="space-y-4">
        <ChoiceRow
          label={t('stream_context_panel_width')}
          value={panelWidth}
          onChange={(next) => {
            setPanelWidth(next);
            void putSetting(KEY_PANEL_WIDTH, next);
          }}
          options={[
            { id: 'compact', label: t('stream_context_width_compact') },
            { id: 'normal', label: t('stream_context_width_normal') },
            { id: 'wide', label: t('stream_context_width_wide') },
          ]}
        />

        <ChoiceRow
          label="Default sort"
          value={sortMode}
          onChange={(next) => {
            setSortMode(next);
            void putSetting(KEY_SORT_MODE, next);
          }}
          options={[
            { id: 'smart', label: 'Smart' },
            { id: 'recent', label: 'Recent' },
            { id: 'due', label: 'Due first' },
          ]}
        />

        <ChoiceRow
          label="Panel density"
          value={density}
          onChange={(next) => {
            setDensity(next);
            void putSetting(KEY_PANEL_DENSITY, next);
          }}
          options={[
            { id: 'airy', label: 'Airy' },
            { id: 'balanced', label: 'Balanced' },
            { id: 'dense', label: 'Dense' },
          ]}
        />
      </section>
    </div>
  );
}
