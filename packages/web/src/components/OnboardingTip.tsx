import { AnimatePresence, motion } from 'framer-motion';
import { Lightbulb, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { getSetting, putSetting } from '../storage/settingsApi';

interface Props {
  tipId: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
}

/**
 * Contextual tip that shows once per user.
 * Stores dismissal state in the settings DB via `onboarding-tip-{tipId}`.
 */
export function OnboardingTip({ tipId, children, position = 'top' }: Props) {
  const [visible, setVisible] = useState(false);
  const settingKey = `onboarding-tip-${tipId}`;

  useEffect(() => {
    let mounted = true;
    getSetting(settingKey).then((val) => {
      if (mounted && val !== 'dismissed') setVisible(true);
    });
    return () => {
      mounted = false;
    };
  }, [settingKey]);

  const dismiss = useCallback(() => {
    setVisible(false);
    putSetting(settingKey, 'dismissed');
  }, [settingKey]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: position === 'top' ? -8 : 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: position === 'top' ? -4 : 4, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="relative flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <Lightbulb
            size={14}
            className="mt-0.5 shrink-0"
            style={{ color: 'var(--color-accent)' }}
          />
          <div className="flex-1 min-w-0">{children}</div>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 rounded-md p-0.5 transition-colors hover:bg-[var(--color-border)]"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <X size={12} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
