import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSetting, putSetting } from '../storage/settingsApi';

type CapsuleLookback = '14' | '30' | '90';
type CapsuleFrequency = 'gentle' | 'regular' | 'frequent';

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

export function TimeCapsuleSettings() {
  const { t } = useTranslation('settings');
  const [enabled, setEnabled] = useState(false);
  const [lookbackWindow, setLookbackWindow] = useState<CapsuleLookback>('30');
  const [frequency, setFrequency] = useState<CapsuleFrequency>('regular');
  const [showInlineHint, setShowInlineHint] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void Promise.all([
      getSetting('time-capsule-enabled'),
      getSetting('time-capsule-lookback-window'),
      getSetting('time-capsule-frequency'),
      getSetting('time-capsule-inline-hint'),
    ]).then(([enabledValue, lookbackValue, frequencyValue, hintValue]) => {
      setEnabled(enabledValue === 'true');
      setLookbackWindow(
        lookbackValue === '14' || lookbackValue === '90' || lookbackValue === '30'
          ? lookbackValue
          : '30',
      );
      setFrequency(
        frequencyValue === 'gentle' || frequencyValue === 'frequent' || frequencyValue === 'regular'
          ? frequencyValue
          : 'regular',
      );
      setShowInlineHint(hintValue !== 'false');
      setReady(true);
    });
  }, []);

  const handleToggle = async (next: boolean) => {
    setEnabled(next);
    await putSetting('time-capsule-enabled', next ? 'true' : 'false');
  };

  if (!ready) {
    return <p className="text-xs text-[var(--color-text-tertiary)]">{t('Loading...')}</p>;
  }

  return (
    <div className="space-y-5">
      <section
        className="rounded-[var(--radius-panel)] border border-[var(--color-border)] p-4"
        style={{ background: 'var(--color-surface)' }}
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-card)]"
            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
          >
            <Sparkles size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">{t('Time capsule')}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              {t(
                'When enabled, the app may occasionally surface an older stream entry as a gentle reminder.',
              )}
            </p>
          </div>
          <Toggle checked={enabled} onToggle={() => void handleToggle(!enabled)} />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('Lookback window')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ['14', t('2 weeks')],
              ['30', t('30 days')],
              ['90', t('90 days')],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setLookbackWindow(id);
                  void putSetting('time-capsule-lookback-window', id);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: lookbackWindow === id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color: lookbackWindow === id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: `1px solid ${
                    lookbackWindow === id ? 'var(--color-accent)' : 'var(--color-border)'
                  }`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('Surfacing rhythm')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ['gentle', t('Gentle')],
              ['regular', t('Regular')],
              ['frequent', t('Frequent')],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setFrequency(id);
                  void putSetting('time-capsule-frequency', id);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: frequency === id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color: frequency === id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: `1px solid ${
                    frequency === id ? 'var(--color-accent)' : 'var(--color-border)'
                  }`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="flex items-start justify-between gap-4 rounded-[var(--radius-card)] border px-4 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {t('Inline hint in Stream')}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              {t(
                'Show a lighter reminder banner in Stream instead of only surfacing the capsule through separate prompts.',
              )}
            </p>
          </div>
          <Toggle
            checked={showInlineHint}
            onToggle={() => {
              const next = !showInlineHint;
              setShowInlineHint(next);
              void putSetting('time-capsule-inline-hint', next ? 'true' : 'false');
            }}
          />
        </div>
      </section>
    </div>
  );
}
