import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, Info, X, XCircle } from 'lucide-react';
import { useToastStore } from '../stores/toastStore';

const ICON_MAP = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
} as const;

const COLOR_MAP = {
  success: {
    bg: 'var(--color-success-soft, rgba(34,197,94,0.1))',
    border: 'var(--color-success, #22c55e)',
    text: 'var(--color-success, #22c55e)',
  },
  error: {
    bg: 'var(--color-danger-soft, rgba(239,68,68,0.1))',
    border: 'var(--color-danger, #ef4444)',
    text: 'var(--color-danger, #ef4444)',
  },
  info: {
    bg: 'var(--color-accent-soft, rgba(99,102,241,0.1))',
    border: 'var(--color-accent, #6366f1)',
    text: 'var(--color-accent, #6366f1)',
  },
} as const;

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismissToast);

  return (
    <div
      className="fixed z-[9999] flex flex-col gap-2 pointer-events-none"
      style={{
        bottom: 'calc(72px + var(--safe-area-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'min(420px, calc(100vw - 32px))',
        width: '100%',
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = ICON_MAP[toast.type];
          const colors = COLOR_MAP[toast.type];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-3 shadow-lg backdrop-blur-md"
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
              }}
            >
              <Icon size={16} style={{ color: colors.text, flexShrink: 0 }} />
              <span
                className="flex-1 text-sm font-medium"
                style={{ color: 'var(--color-text)' }}
              >
                {toast.message}
              </span>
              {toast.action && (
                <button
                  type="button"
                  onClick={toast.action.onClick}
                  className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ color: colors.text }}
                >
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded p-0.5 transition-opacity hover:opacity-60"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
