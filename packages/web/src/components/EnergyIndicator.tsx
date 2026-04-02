import { Battery, BatteryLow, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EnergyLevel } from '../stores/execCoachStore';
import { useExecCoachStore } from '../stores/execCoachStore';
import { useToastStore } from '../stores/toastStore';

const LEVELS: { id: EnergyLevel; icon: typeof Battery }[] = [
  { id: 'low', icon: BatteryLow },
  { id: 'normal', icon: Battery },
  { id: 'high', icon: Zap },
];

export function EnergyIndicator() {
  const { t } = useTranslation('coach');
  const energyLevel = useExecCoachStore((s) => s.energyLevel);
  const setEnergyLevel = useExecCoachStore((s) => s.setEnergyLevel);
  const showToast = useToastStore((s) => s.showToast);

  const cycle = () => {
    const order: EnergyLevel[] = ['low', 'normal', 'high'];
    const i = order.indexOf(energyLevel);
    const ni = (i + 1) % order.length;
    const next = order[ni] ?? 'normal';
    setEnergyLevel(next);
    if (next === 'low') {
      showToast({ message: t('energy_toast_low'), type: 'info' });
    } else if (next === 'high') {
      showToast({ message: t('energy_toast_high'), type: 'info' });
    } else {
      showToast({ message: t('energy_toast_normal'), type: 'info' });
    }
  };

  const current = LEVELS.find((l) => l.id === energyLevel) ?? LEVELS[1] ?? LEVELS[0];
  const Icon = current.icon;

  return (
    <button
      type="button"
      onClick={cycle}
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
    </button>
  );
}
