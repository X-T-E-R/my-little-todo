import { AnimatePresence, motion } from 'framer-motion';
import {
  BookMarked,
  BookOpen,
  Briefcase,
  Check,
  ChevronRight,
  Cloud,
  Heart,
  Home,
  Laptop,
  Monitor,
  Moon,
  Palette,
  Rocket,
  Sun,
  Users,
  Wifi,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../locales';
import { putSetting } from '../storage/settingsApi';
import { useRoleStore } from '../stores';
import { canChooseMode, canControlServer } from '../utils/platform';

interface Props {
  isReentry?: boolean;
  onComplete: () => void;
}

const ROLE_PRESETS = [
  { id: 'study', label: 'Study', icon: BookOpen, color: '#3B82F6' },
  { id: 'work', label: 'Work', icon: Briefcase, color: '#F97316' },
  { id: 'life', label: 'Life', icon: Home, color: '#22C55E' },
  { id: 'creative', label: 'Creative', icon: Palette, color: '#A855F7' },
  { id: 'health', label: 'Health', icon: Heart, color: '#EF4444' },
  { id: 'reading', label: 'Reading', icon: BookMarked, color: '#06B6D4' },
  { id: 'side', label: 'Side Project', icon: Rocket, color: '#EAB308' },
  { id: 'social', label: 'Social', icon: Users, color: '#EC4899' },
] as const;

function WelcomeStep({ isReentry, onNext }: { isReentry: boolean; onNext: () => void }) {
  const { t } = useTranslation('onboarding');
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center gap-6 text-center px-6"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
        className="flex h-20 w-20 items-center justify-center rounded-2xl"
        style={{ background: 'var(--color-accent)', boxShadow: '0 8px 32px var(--color-accent)' }}
      >
        <span className="text-3xl font-bold text-white">M</span>
      </motion.div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
          {isReentry ? t('Re-learn My Little Todo') : 'My Little Todo'}
        </h1>
        <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
          {t('This is not a task manager, this is your external execution system')}
        </p>
      </div>

      <p
        className="max-w-xs text-sm leading-relaxed"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        {t('Open to see only one thing, finish it and do the next.')}
        <br />
        {t('Write whatever you think, AI helps you organize.')}
      </p>

      <motion.button
        type="button"
        onClick={onNext}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="mt-4 flex items-center gap-2 rounded-2xl px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-shadow hover:shadow-xl"
        style={{ background: 'var(--color-accent)' }}
      >
        {isReentry ? t('Continue') : t('Start')}
        <ChevronRight size={18} />
      </motion.button>
    </motion.div>
  );
}

function PresetsStep({
  onNext,
  onSkip,
}: { onNext: (selected: string[]) => void; onSkip: () => void }) {
  const { t } = useTranslation('onboarding');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const existingRoles = useRoleStore((s) => s.roles);
  const existingNames = new Set(existingRoles.map((r) => r.name));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center gap-6 px-6"
    >
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
          {t('What do you mainly use it for?')}
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Select scenes to quickly create roles, you can modify them anytime')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {ROLE_PRESETS.map((preset) => {
          const Icon = preset.icon;
          const isSelected = selected.has(preset.id);
          const alreadyExists = existingNames.has(t(preset.label));
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => !alreadyExists && toggle(preset.id)}
              disabled={alreadyExists}
              className="relative flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all"
              style={{
                background: alreadyExists
                  ? 'var(--color-bg)'
                  : isSelected
                    ? `${preset.color}18`
                    : 'var(--color-surface)',
                border: isSelected ? `2px solid ${preset.color}` : '2px solid var(--color-border)',
                opacity: alreadyExists ? 0.5 : 1,
              }}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                style={{ background: `${preset.color}20`, color: preset.color }}
              >
                <Icon size={16} />
              </div>
              <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {t(preset.label)}
              </span>
              {alreadyExists && (
                <span
                  className="absolute right-3 text-[10px] font-medium"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t('Already exists')}
                </span>
              )}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute right-3 flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ background: preset.color }}
                >
                  <Check size={12} className="text-white" />
                </motion.div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-2 w-full max-w-sm">
        <motion.button
          type="button"
          onClick={() => onNext(Array.from(selected))}
          disabled={selected.size === 0}
          whileHover={{ scale: selected.size > 0 ? 1.02 : 1 }}
          whileTap={{ scale: selected.size > 0 ? 0.98 : 1 }}
          className="w-full rounded-2xl px-6 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: 'var(--color-accent)' }}
        >
          {selected.size > 0
            ? t('Create {{count}} roles', { count: selected.size })
            : t('Create roles')}
        </motion.button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs py-2 transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {t('Skip, maybe later')}
        </button>
      </div>
    </motion.div>
  );
}

function QuickConfigStep({
  onNext,
  onSaveConfig,
}: {
  onNext: () => void;
  onSaveConfig?: (config: { useMode: string; cloudUrl: string; lanAccess: boolean }) => void;
}) {
  const { t } = useTranslation('onboarding');
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [lanAccess, setLanAccess] = useState(false);
  const [useMode, setUseMode] = useState<'local' | 'cloud'>('local');
  const [cloudUrl, setCloudUrl] = useState('');

  const showModeSelector = canChooseMode();
  const showServerConfig = canControlServer();

  const themeOptions = [
    { key: 'system' as const, label: t('Follow system'), icon: Monitor },
    { key: 'light' as const, label: t('Light'), icon: Sun },
    { key: 'dark' as const, label: t('Dark'), icon: Moon },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center gap-6 px-6"
    >
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
          {t('Personalize')}
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('These can be modified in settings anytime')}
        </p>
      </div>

      <div className="w-full max-w-sm space-y-5">
        {/* Language selector */}
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            {t('Language')}
          </p>
          <select
            value={i18n.language}
            onChange={(e) => {
              i18n.changeLanguage(e.target.value);
              localStorage.setItem('language', e.target.value);
            }}
            className="w-full rounded-xl px-3 py-2 text-sm font-medium outline-none"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}
          >
            <option value="zh-CN">中文（简体）</option>
            <option value="en">English</option>
          </select>
        </div>

        {/* Use mode - only when platform can choose mode (Tauri PC) */}
        {showModeSelector && (
          <div>
            <p
              className="text-xs font-medium mb-2"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t('Usage mode')}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUseMode('local')}
                className="flex flex-1 flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-medium transition-all"
                style={{
                  background: useMode === 'local' ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: useMode === 'local' ? 'white' : 'var(--color-text-secondary)',
                  border:
                    useMode === 'local'
                      ? '1px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                }}
              >
                <Laptop size={16} />
                {t('Local mode')}
              </button>
              <button
                type="button"
                onClick={() => setUseMode('cloud')}
                className="flex flex-1 flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-medium transition-all"
                style={{
                  background: useMode === 'cloud' ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: useMode === 'cloud' ? 'white' : 'var(--color-text-secondary)',
                  border:
                    useMode === 'cloud'
                      ? '1px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                }}
              >
                <Cloud size={16} />
                {t('Connect to cloud')}
              </button>
            </div>
            {useMode === 'local' && (
              <p className="mt-1.5 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('Data stored locally, this PC acts as server')}
              </p>
            )}
            {useMode === 'cloud' && (
              <div className="mt-2">
                <input
                  type="url"
                  value={cloudUrl}
                  onChange={(e) => setCloudUrl(e.target.value)}
                  placeholder="https://your-server.com"
                  className="w-full rounded-xl px-3 py-2 text-xs outline-none transition-colors"
                  style={{
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
                <p className="mt-1.5 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t("Connect to remote server, don't start local backend")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Theme */}
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            {t('Theme')}
          </p>
          <div className="flex gap-2">
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              const active = theme === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setTheme(opt.key)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-medium transition-all"
                  style={{
                    background: active ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: active ? 'white' : 'var(--color-text-secondary)',
                    border: active
                      ? '1px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                  }}
                >
                  <Icon size={14} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* LAN access - only when platform can control server and in local mode */}
        {showServerConfig && useMode === 'local' && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi size={15} style={{ color: 'var(--color-text-secondary)' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {t('Allow LAN access')}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('Let phone and other devices connect to this PC')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLanAccess(!lanAccess)}
              className="relative h-6 w-11 rounded-full transition-colors shrink-0"
              style={{ background: lanAccess ? 'var(--color-accent)' : 'var(--color-border)' }}
            >
              <motion.div
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
                animate={{ left: lanAccess ? '22px' : '2px' }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 w-full max-w-sm mt-2">
        <motion.button
          type="button"
          onClick={() => {
            localStorage.setItem('mlt-use-mode', useMode);
            if (useMode === 'cloud' && cloudUrl) {
              localStorage.setItem('mlt-cloud-url', cloudUrl);
            } else {
              localStorage.removeItem('mlt-cloud-url');
            }
            if (lanAccess) {
              localStorage.setItem('mlt-lan-access', 'true');
            }
            onSaveConfig?.({ useMode, cloudUrl, lanAccess });
            onNext();
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full rounded-2xl px-6 py-3 text-sm font-semibold text-white"
          style={{ background: 'var(--color-accent)' }}
        >
          {t('Done')}
        </motion.button>
        <button
          type="button"
          onClick={onNext}
          className="text-xs py-2 transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {t('Skip')}
        </button>
      </div>
    </motion.div>
  );
}

function DoneStep({ onEnter }: { onEnter: () => void }) {
  const { t } = useTranslation('onboarding');
  useEffect(() => {
    const timer = setTimeout(onEnter, 2500);
    return () => clearTimeout(timer);
  }, [onEnter]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center gap-5 text-center px-6"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.1 }}
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: 'var(--color-accent)' }}
      >
        <Check size={28} className="text-white" strokeWidth={3} />
      </motion.div>
      <div className="space-y-1">
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
          {t('All ready')}
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Start using')}
        </p>
      </div>
      <motion.button
        type="button"
        onClick={onEnter}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="rounded-2xl px-8 py-3 text-sm font-semibold text-white"
        style={{ background: 'var(--color-accent)' }}
      >
        {t('Enter app')}
      </motion.button>
    </motion.div>
  );
}

export function OnboardingView({ isReentry = false, onComplete }: Props) {
  const { t } = useTranslation('onboarding');
  const [step, setStep] = useState(0);
  const createRole = useRoleStore((s) => s.createRole);

  const totalSteps = isReentry ? 3 : 4;

  const handlePresetsNext = async (selectedIds: string[]) => {
    for (const id of selectedIds) {
      const preset = ROLE_PRESETS.find((p) => p.id === id);
      if (preset) {
        try {
          await createRole(t(preset.label), { color: preset.color });
        } catch {
          // role limit reached
        }
      }
    }
    setStep(2);
  };

  const handleComplete = async () => {
    try {
      await putSetting('onboarding-completed', 'true');
    } catch {
      /* server unreachable — localStorage fallback below */
    }
    localStorage.setItem('mlt-onboarding-completed', 'true');
    onComplete();
  };

  const getStepIndex = () => {
    if (isReentry) {
      // skip presets step: 0=welcome, 1=config, 2=done
      if (step === 0) return 'welcome';
      if (step === 1) return 'config';
      return 'done';
    }
    if (step === 0) return 'welcome';
    if (step === 1) return 'presets';
    if (step === 2) return 'config';
    return 'done';
  };

  const currentStep = getStepIndex();

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[var(--color-bg)]">
      {/* Progress dots */}
      <div className="absolute top-8 flex gap-2">
        {Array.from({ length: totalSteps }).map((_, i) => {
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static-length progress dots
              key={i}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: isActive ? '24px' : '8px',
                background: isActive
                  ? 'var(--color-accent)'
                  : isDone
                    ? 'var(--color-accent)'
                    : 'var(--color-border)',
                opacity: isDone ? 0.4 : 1,
              }}
            />
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {currentStep === 'welcome' && (
          <WelcomeStep key="welcome" isReentry={isReentry} onNext={() => setStep(1)} />
        )}
        {currentStep === 'presets' && (
          <PresetsStep key="presets" onNext={handlePresetsNext} onSkip={() => setStep(2)} />
        )}
        {currentStep === 'config' && (
          <QuickConfigStep key="config" onNext={() => setStep(isReentry ? 2 : 3)} />
        )}
        {currentStep === 'done' && <DoneStep key="done" onEnter={handleComplete} />}
      </AnimatePresence>
    </div>
  );
}
