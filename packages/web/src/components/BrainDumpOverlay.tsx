import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStreamStore, useWorkThreadStore } from '../stores';
import { useToastStore } from '../stores/toastStore';
import { getWorkThreadFocusLabel, getWorkThreadFocusParent } from '../utils/workThreadFocus';

interface BrainDumpOverlayProps {
  open: boolean;
  onClose: () => void;
}

type BrainDumpTarget = 'stream' | 'body' | 'intent' | 'spark';

export function BrainDumpOverlay({ open, onClose }: BrainDumpOverlayProps) {
  const { t } = useTranslation('coach');
  const addEntry = useStreamStore((s) => s.addEntry);
  const currentThread = useWorkThreadStore((s) => s.currentThread);
  const workspaceFocus = useWorkThreadStore((s) => s.workspaceFocus);
  const setWorkspaceFocus = useWorkThreadStore((s) => s.setWorkspaceFocus);
  const requestWorkspaceAutoFocus = useWorkThreadStore((s) => s.requestWorkspaceAutoFocus);
  const captureToCurrentThread = useWorkThreadStore((s) => s.captureToCurrentThread);
  const addIntent = useWorkThreadStore((s) => s.addIntent);
  const addSparkContainer = useWorkThreadStore((s) => s.addSparkContainer);
  const showToast = useToastStore((s) => s.showToast);
  const [line, setLine] = useState('');
  const [count, setCount] = useState(0);
  const [target, setTarget] = useState<BrainDumpTarget>('stream');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setCount(0);
      setLine('');
      setTarget(currentThread && (workspaceFocus.kind === 'intent' || workspaceFocus.kind === 'spark' || workspaceFocus.kind === 'exploration') ? 'body' : currentThread ? 'intent' : 'stream');
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, currentThread, workspaceFocus]);

  const flushLine = useCallback(async () => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (target === 'body' && currentThread) {
      await captureToCurrentThread(trimmed, 'brain-dump');
    } else if (target === 'intent' && currentThread) {
      const created = await addIntent(trimmed, { insertIntoDoc: true });
      if (created) {
        setWorkspaceFocus({ kind: 'intent', id: created.id });
        requestWorkspaceAutoFocus(created.id);
      }
    } else if (target === 'spark' && currentThread) {
      const created = await addSparkContainer(trimmed, getWorkThreadFocusParent(workspaceFocus));
      if (created) {
        setWorkspaceFocus({ kind: 'spark', id: created.id });
        requestWorkspaceAutoFocus(created.id);
      }
    } else {
      await addEntry(trimmed, false, { entryType: 'spark' });
    }
    setCount((c) => c + 1);
    setLine('');
  }, [
    line,
    addEntry,
    addIntent,
    addSparkContainer,
    captureToCurrentThread,
    currentThread,
    requestWorkspaceAutoFocus,
    setWorkspaceFocus,
    target,
    workspaceFocus,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void flushLine();
    }
    if (e.key === 'Escape') {
      if (count > 0) {
        showToast({
          message:
            target === 'body' && currentThread
              ? t('brain_dump_captured_thread', { count, title: currentThread.title })
              : target === 'intent' && currentThread
                ? t('brain_dump_captured_intent', { count, title: currentThread.title })
              : target === 'spark' && currentThread
                ? t('brain_dump_captured_spark', { count, title: currentThread.title })
              : t('brain_dump_captured', { count }),
          type: 'success',
        });
      }
      onClose();
    }
  };

  const handleClose = () => {
    if (count > 0) {
      showToast({
        message:
          target === 'body' && currentThread
            ? t('brain_dump_captured_thread', { count, title: currentThread.title })
            : target === 'intent' && currentThread
              ? t('brain_dump_captured_intent', { count, title: currentThread.title })
            : target === 'spark' && currentThread
              ? t('brain_dump_captured_spark', { count, title: currentThread.title })
            : t('brain_dump_captured', { count }),
        type: 'success',
      });
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-4"
          style={{ background: 'color-mix(in srgb, var(--color-bg) 92%, black)' }}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="relative w-full max-w-lg rounded-3xl p-6 shadow-2xl"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-lg p-1"
              style={{ color: 'var(--color-text-tertiary)' }}
              aria-label={t('Close')}
            >
              <X size={18} />
            </button>
            <h2 className="text-lg font-bold pr-10" style={{ color: 'var(--color-text)' }}>
              {t('Brain dump')}
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('brain_dump_hint')}
            </p>
            {currentThread && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <div
                  className="flex items-center rounded-full border p-0.5"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <button
                    type="button"
                    onClick={() => setTarget('body')}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                      target === 'body'
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                    }`}
                    title={currentThread.title}
                  >
                    {t('brain_dump_target_body')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTarget('intent')}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                      target === 'intent'
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {t('brain_dump_target_intent')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTarget('spark')}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                      target === 'spark'
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {t('brain_dump_target_spark')}
                  </button>
                </div>
                <p
                  className="min-w-0 truncate text-[11px]"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  title={currentThread.title}
                >
                  {`${t('brain_dump_targeting_thread', { title: currentThread.title })} · 当前焦点：${getWorkThreadFocusLabel(
                    currentThread,
                    workspaceFocus,
                  )}`}
                </p>
              </div>
            )}
            <textarea
              ref={inputRef}
              value={line}
              onChange={(e) => setLine(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                currentThread && target === 'body'
                  ? t('brain_dump_placeholder_thread')
                  : currentThread && target === 'intent'
                    ? t('brain_dump_placeholder_intent')
                  : currentThread && target === 'spark'
                    ? t('brain_dump_placeholder_spark')
                  : t('brain_dump_placeholder')
              }
              rows={4}
              className="mt-4 w-full resize-none rounded-2xl px-4 py-3 text-[15px] leading-relaxed outline-none"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
            <p className="mt-2 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {t('brain_dump_enter')}
            </p>
            {count > 0 && (
              <p className="mt-3 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
                {t('brain_dump_session_count', { count })}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
