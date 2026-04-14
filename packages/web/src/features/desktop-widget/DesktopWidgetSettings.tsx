import { Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSetting, putSetting } from '../../storage/settingsApi';
import type { WidgetDisplayMode } from '../../utils/desktopWidget';
import { isTauriEnv } from '../../utils/platform';

const MODE_KEY = 'plugin:desktop-widget:display-mode';
const DENSITY_KEY = 'desktop-widget:density';
const FOLLOW_ROLE_KEY = 'desktop-widget:follow-role';
const CLICK_BEHAVIOR_KEY = 'desktop-widget:click-behavior';

type WidgetDensity = 'airy' | 'balanced' | 'dense';
type WidgetClickBehavior = 'open-stream' | 'open-now' | 'toggle-context';

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

export function DesktopWidgetSettings() {
  const { t: ts } = useTranslation('settings');
  const [mode, setMode] = useState<WidgetDisplayMode>('overlay');
  const [density, setDensity] = useState<WidgetDensity>('balanced');
  const [followRole, setFollowRole] = useState(true);
  const [clickBehavior, setClickBehavior] = useState<WidgetClickBehavior>('open-stream');
  const tauri = isTauriEnv();

  const openWidget = async () => {
    const mod = await import('../../utils/desktopWidget');
    await mod.ensureWidgetWindow(mode);
  };

  const closeWidget = async () => {
    const mod = await import('../../utils/desktopWidget');
    await mod.closeWidgetWindow();
  };

  const openContextBar = async () => {
    const mod = await import('../../utils/desktopWidget');
    await mod.ensureContextBarWindow();
  };

  const closeContextBar = async () => {
    const mod = await import('../../utils/desktopWidget');
    await mod.closeContextBarWindow();
  };

  useEffect(() => {
    void Promise.all([
      getSetting(MODE_KEY),
      getSetting(DENSITY_KEY),
      getSetting(FOLLOW_ROLE_KEY),
      getSetting(CLICK_BEHAVIOR_KEY),
    ]).then(([modeValue, densityValue, followRoleValue, clickBehaviorValue]) => {
      if (modeValue === 'pin' || modeValue === 'overlay') setMode(modeValue);
      setDensity(
        densityValue === 'airy' || densityValue === 'dense' || densityValue === 'balanced'
          ? densityValue
          : 'balanced',
      );
      setFollowRole(followRoleValue !== 'false');
      setClickBehavior(
        clickBehaviorValue === 'open-now' ||
          clickBehaviorValue === 'toggle-context' ||
          clickBehaviorValue === 'open-stream'
          ? clickBehaviorValue
          : 'open-stream',
      );
    });
  }, []);

  const persistMode = async (next: WidgetDisplayMode) => {
    setMode(next);
    await putSetting(MODE_KEY, next);
  };

  if (!tauri) {
    return (
      <p className="text-sm text-[var(--color-text-tertiary)]">{ts('desktop_widget_tauri_only')}</p>
    );
  }

  return (
    <div className="space-y-5 text-sm text-[var(--color-text)]">
      <section
        className="rounded-[var(--radius-panel)] border p-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <p className="text-sm font-semibold text-[var(--color-text)]">{ts('Desktop surfaces')}</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {ts(
            'Decide how the widget and context bar appear on desktop, how dense they are, and what they do when clicked.',
          )}
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void openWidget()}
            className="inline-flex items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-bg)]"
          >
            <Monitor size={16} />
            {ts('Open widget window')}
          </button>
          <button
            type="button"
            onClick={() => void closeWidget()}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
          >
            {ts('Close widget')}
          </button>
          <button
            type="button"
            onClick={() => void openContextBar()}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-bg)]"
          >
            {ts('Open context bar')}
          </button>
          <button
            type="button"
            onClick={() => void closeContextBar()}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
          >
            {ts('Close context bar')}
          </button>
        </div>

        <ChoiceRow
          label={ts('desktop_widget_mode')}
          value={mode}
          onChange={(next) => void persistMode(next)}
          options={[
            { id: 'overlay', label: ts('Overlay') },
            { id: 'pin', label: ts('Pin beneath other windows') },
          ]}
        />

        <ChoiceRow
          label={ts('Information density')}
          value={density}
          onChange={(next) => {
            setDensity(next);
            void putSetting(DENSITY_KEY, next);
          }}
          options={[
            { id: 'airy', label: ts('Airy') },
            { id: 'balanced', label: ts('Balanced') },
            { id: 'dense', label: ts('Dense') },
          ]}
        />

        <ChoiceRow
          label={ts('Primary click behavior')}
          value={clickBehavior}
          onChange={(next) => {
            setClickBehavior(next);
            void putSetting(CLICK_BEHAVIOR_KEY, next);
          }}
          options={[
            { id: 'open-stream', label: ts('Open Stream') },
            { id: 'open-now', label: ts('Open Now') },
            { id: 'toggle-context', label: ts('Toggle Context Bar') },
          ]}
        />

        <div
          className="flex items-start justify-between gap-4 rounded-[var(--radius-card)] border px-4 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {ts('Follow current role')}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              {ts(
                'Keep the widget content aligned with the currently active role instead of pinning a fixed role snapshot.',
              )}
            </p>
          </div>
          <Toggle
            checked={followRole}
            onToggle={() => {
              const next = !followRole;
              setFollowRole(next);
              void putSetting(FOLLOW_ROLE_KEY, next ? 'true' : 'false');
            }}
          />
        </div>
      </section>

      <p className="text-[11px] text-[var(--color-text-tertiary)]">{ts('desktop_widget_hint')}</p>
    </div>
  );
}
