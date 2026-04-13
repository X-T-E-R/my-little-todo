import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkThreadStore } from '../stores';

type SchedulerPolicy = 'manual' | 'coach' | 'semi_auto';

const POLICY_OPTIONS: SchedulerPolicy[] = ['manual', 'coach', 'semi_auto'];

export function WorkThreadSettingsSection() {
  const { t } = useTranslation(['settings', 'think']);
  const loadSchedulerPolicy = useWorkThreadStore((s) => s.loadSchedulerPolicy);
  const setSchedulerPolicy = useWorkThreadStore((s) => s.setSchedulerPolicy);
  const [policy, setPolicy] = useState<SchedulerPolicy>('coach');

  useEffect(() => {
    void loadSchedulerPolicy().then((value) => {
      setPolicy(value);
    });
  }, [loadSchedulerPolicy]);

  return (
    <section
      className="rounded-2xl border p-4"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
      <h3 className="text-sm font-semibold text-[var(--color-text)]">
        {t('work_thread_settings_title')}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
        {t('work_thread_settings_intro')}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {POLICY_OPTIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setPolicy(item);
              void setSchedulerPolicy(item);
            }}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: policy === item ? 'var(--color-accent-soft)' : 'var(--color-bg)',
              color: policy === item ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              border: `1px solid ${policy === item ? 'var(--color-accent)' : 'var(--color-border)'}`,
            }}
          >
            {t(`thread_scheduler_policy_${item}`, { ns: 'think' })}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
        {t(`work_thread_settings_policy_hint_${policy}`)}
      </p>
    </section>
  );
}
