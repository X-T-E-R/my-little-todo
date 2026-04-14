import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScheduleEditor } from '../../components/ScheduleEditor';
import { getSetting, putSetting } from '../../storage/settingsApi';
import { useBehaviorStore } from '../../stores/behaviorStore';
import {
  computeHourlyAcceptancePatterns,
  getLearnedTimeSummary,
  useTimeAwarenessStore,
} from '../../stores/timeAwarenessStore';

type TimeSensitivity = 'gentle' | 'balanced' | 'high';
type ReminderIntensity = 'subtle' | 'standard' | 'strong';

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

export function TimeAwarenessSettings() {
  const { t } = useTranslation('settings');
  const { t: tCal } = useTranslation('calendar');
  const { load } = useTimeAwarenessStore();
  const events = useBehaviorStore((s) => s.events);
  const loadBehavior = useBehaviorStore((s) => s.load);
  const [sensitivity, setSensitivity] = useState<TimeSensitivity>('balanced');
  const [reminderIntensity, setReminderIntensity] = useState<ReminderIntensity>('standard');
  const [learningEnabled, setLearningEnabled] = useState(true);

  useEffect(() => {
    void load();
    void loadBehavior();
    void Promise.all([
      getSetting('time-awareness-sensitivity'),
      getSetting('time-awareness-reminder-intensity'),
      getSetting('time-awareness-learning-enabled'),
    ]).then(([sensitivityValue, reminderValue, learningValue]) => {
      setSensitivity(
        sensitivityValue === 'gentle' ||
          sensitivityValue === 'high' ||
          sensitivityValue === 'balanced'
          ? sensitivityValue
          : 'balanced',
      );
      setReminderIntensity(
        reminderValue === 'subtle' || reminderValue === 'strong' || reminderValue === 'standard'
          ? reminderValue
          : 'standard',
      );
      setLearningEnabled(learningValue !== 'false');
    });
  }, [load, loadBehavior]);

  const patterns = useMemo(() => computeHourlyAcceptancePatterns(events), [events]);
  const { peakHour, lowHour } = useMemo(() => getLearnedTimeSummary(patterns), [patterns]);

  const formatHour = (hour: number | null) => {
    if (hour === null) return '—';
    return t('time_pattern_hour', { hour });
  };

  return (
    <div className="space-y-5">
      <section
        className="rounded-[var(--radius-panel)] border p-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <p className="text-sm font-semibold text-[var(--color-text)]">{t('time_pattern_title')}</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {t(
            'Blend learned work rhythms with your preferred intervention strength so reminders feel timely without becoming noisy.',
          )}
        </p>
      </section>

      <section className="space-y-4">
        <ChoiceRow
          label={t('Recommendation sensitivity')}
          value={sensitivity}
          onChange={(next) => {
            setSensitivity(next);
            void putSetting('time-awareness-sensitivity', next);
          }}
          options={[
            { id: 'gentle', label: t('Gentle') },
            { id: 'balanced', label: t('Balanced') },
            { id: 'high', label: t('High') },
          ]}
        />

        <ChoiceRow
          label={t('Reminder intensity')}
          value={reminderIntensity}
          onChange={(next) => {
            setReminderIntensity(next);
            void putSetting('time-awareness-reminder-intensity', next);
          }}
          options={[
            { id: 'subtle', label: t('Subtle') },
            { id: 'standard', label: t('Standard') },
            { id: 'strong', label: t('Strong') },
          ]}
        />

        <div
          className="flex items-start justify-between gap-4 rounded-[var(--radius-card)] border px-4 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {t('Learn from behavior')}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              {t('Keep refining time suggestions based on accepted and postponed tasks.')}
            </p>
          </div>
          <Toggle
            checked={learningEnabled}
            onToggle={() => {
              const next = !learningEnabled;
              setLearningEnabled(next);
              void putSetting('time-awareness-learning-enabled', next ? 'true' : 'false');
            }}
          />
        </div>
      </section>

      <section>
        <div
          className="rounded-[var(--radius-panel)] p-4 space-y-3"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
            {t('time_pattern_title')}
          </h3>
          <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('time_pattern_hint')}
          </p>
          <div className="grid gap-2 text-[12px] sm:grid-cols-2">
            <div
              className="rounded-[var(--radius-card)] px-3 py-2"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
            >
              <span style={{ color: 'var(--color-text-tertiary)' }}>{t('time_pattern_peak')}</span>
              <p className="font-semibold mt-0.5" style={{ color: 'var(--color-text)' }}>
                {peakHour !== null ? formatHour(peakHour) : t('time_pattern_not_enough')}
              </p>
            </div>
            <div
              className="rounded-[var(--radius-card)] px-3 py-2"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
            >
              <span style={{ color: 'var(--color-text-tertiary)' }}>{t('time_pattern_low')}</span>
              <p className="font-semibold mt-0.5" style={{ color: 'var(--color-text)' }}>
                {lowHour !== null ? formatHour(lowHour) : t('time_pattern_not_enough')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text)' }}>
          {tCal('Schedule')}
        </h3>
        <p className="text-[11px] mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
          {tCal('time_awareness_schedule_hint')}
        </p>
        <ScheduleEditor />
      </section>
    </div>
  );
}
