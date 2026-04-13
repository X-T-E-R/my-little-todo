import type { ThinkSession } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import { History, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function preview(s: ThinkSession): string {
  const t = s.content.replace(/\s+/g, ' ').trim();
  return t.slice(0, 48) + (t.length > 48 ? '…' : '');
}

export function ThinkSessionHistory({
  open,
  sessions,
  onClose,
  onOpen,
  onDelete,
}: {
  open: boolean;
  sessions: ThinkSession[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation('think');

  return (
    <AnimatePresence>
      {open && (
        <motion.dialog
          open
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-stretch justify-end bg-black/30"
          aria-label={t('history_title')}
        >
          <motion.div
            initial={{ x: 40 }}
            animate={{ x: 0 }}
            exit={{ x: 40 }}
            className="flex h-full w-full max-w-sm flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center gap-2">
                <History size={18} style={{ color: 'var(--color-accent)' }} />
                <span className="text-sm font-semibold">{t('history_title')}</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1"
                aria-label={t('close')}
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {sessions.length === 0 ? (
                <p
                  className="px-2 py-6 text-center text-xs"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t('history_empty')}
                </p>
              ) : (
                <ul className="space-y-1">
                  {sessions.map((s) => (
                    <li
                      key={s.id}
                      className="group flex items-start gap-2 rounded-xl border border-transparent px-2 py-2 hover:border-[var(--color-border)]"
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(s.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div
                          className="text-[10px] font-medium uppercase tracking-wide"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {new Date(s.updatedAt).toLocaleString()}
                        </div>
                        <div
                          className="mt-0.5 line-clamp-2 text-xs"
                          style={{ color: 'var(--color-text)' }}
                        >
                          {preview(s) || t('history_untitled')}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(s.id)}
                        className="shrink-0 rounded-lg p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                        style={{ color: 'var(--color-text-tertiary)' }}
                        aria-label={t('delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.dialog>
      )}
    </AnimatePresence>
  );
}
