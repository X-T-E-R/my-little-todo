import { Battery, BatteryLow, CircleDot, ListCollapse, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EnergyLevel, WorkMode } from '../stores/execCoachStore';
import { useExecCoachStore } from '../stores/execCoachStore';
import { useToastStore } from '../stores/toastStore';

const ENERGY_LEVELS: { id: EnergyLevel; icon: typeof Battery }[] = [
  { id: 'low', icon: BatteryLow },
  { id: 'normal', icon: Battery },
  { id: 'high', icon: Zap },
];

const WORK_MODES: WorkMode[] = ['neutral', 'exploring', 'executing', 'blocked'];

export function EnergyIndicator() {
  const { t } = useTranslation('coach');
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draftNote, setDraftNote] = useState('');
  const energyLevel = useExecCoachStore((s) => s.energyLevel);
  const workMode = useExecCoachStore((s) => s.workMode);
  const workStateNote = useExecCoachStore((s) => s.workStateNote);
  const workStateHistory = useExecCoachStore((s) => s.workStateHistory);
  const setEnergyLevel = useExecCoachStore((s) => s.setEnergyLevel);
  const setWorkMode = useExecCoachStore((s) => s.setWorkMode);
  const saveWorkStateNote = useExecCoachStore((s) => s.saveWorkStateNote);
  const showToast = useToastStore((s) => s.showToast);

  useEffect(() => {
    if (!open) return;
    setDraftNote(workStateNote ?? '');
  }, [open, workStateNote]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const current = useMemo(
    () => ENERGY_LEVELS.find((level) => level.id === energyLevel) ?? ENERGY_LEVELS[1] ?? ENERGY_LEVELS[0],
    [energyLevel],
  );
  const Icon = current.icon;

  const updateEnergy = (next: EnergyLevel) => {
    setEnergyLevel(next);
    const key =
      next === 'low' ? 'energy_toast_low' : next === 'high' ? 'energy_toast_high' : 'energy_toast_normal';
    showToast({ message: t(key), type: 'info' });
  };

  const updateWorkMode = (next: WorkMode) => {
    setWorkMode(next, draftNote);
    showToast({ message: t(`work_mode_toast_${next}`), type: 'info' });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors"
        style={{
          color: 'var(--color-text-tertiary)',
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
        }}
        title={t('Energy — tap to cycle')}
      >
        <Icon size={14} strokeWidth={2} />
        <span className="hidden sm:inline max-w-[72px] truncate">{t(`energy_${energyLevel}`)}</span>
        <CircleDot size={12} strokeWidth={2} />
      </button>
      {open ? (
        <div
          className="absolute bottom-full left-0 z-40 mb-2 w-[280px] rounded-2xl border p-3 shadow-2xl"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('work_state_title')}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {ENERGY_LEVELS.map((level) => (
              <button
                key={level.id}
                type="button"
                onClick={() => updateEnergy(level.id)}
                className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{
                  background: energyLevel === level.id ? 'var(--color-accent)' : 'var(--color-bg)',
                  color: energyLevel === level.id ? 'white' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {t(`energy_${level.id}`)}
              </button>
            ))}
          </div>

          <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('work_mode_title')}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {WORK_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => updateWorkMode(mode)}
                className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{
                  background: workMode === mode ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color: workMode === mode ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {t(`work_mode_${mode}`)}
              </button>
            ))}
          </div>

          <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('work_state_note_title')}
          </div>
          <textarea
            value={draftNote}
            onChange={(event) => setDraftNote(event.target.value)}
            rows={3}
            placeholder={t('work_state_note_placeholder')}
            className="mt-2 w-full resize-none rounded-xl border px-3 py-2 text-xs outline-none"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => saveWorkStateNote(draftNote)}
              className="rounded-full px-3 py-1.5 text-[11px] font-medium"
              style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)' }}
            >
              {t('work_state_note_save')}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-3 py-1.5 text-[11px] font-medium"
              style={{ color: 'var(--color-text-secondary)', background: 'var(--color-bg)' }}
            >
              {t('Close')}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-tertiary)' }}>
            <ListCollapse size={12} />
            {t('work_state_history_title')}
          </div>
          <div className="mt-2 space-y-2">
            {workStateHistory.length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('work_state_history_empty')}
              </div>
            ) : (
              workStateHistory.slice(0, 4).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border px-3 py-2 text-[11px]"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div style={{ color: 'var(--color-text)' }}>
                    {t(`work_mode_${entry.workMode}`)} · {t(`energy_${entry.energyLevel}`)}
                  </div>
                  {entry.note ? (
                    <div className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                      {entry.note}
                    </div>
                  ) : null}
                  <div className="mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
