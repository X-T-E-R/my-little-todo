import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStreamStore, useWorkThreadStore } from '../stores';
import { useToastStore } from '../stores/toastStore';

interface BrainDumpOverlayProps {
  open: boolean;
  onClose: () => void;
}

type BrainDumpTarget = 'stream' | 'log' | 'spark';

export function BrainDumpOverlay({ open, onClose }: BrainDumpOverlayProps) {
  const { t } = useTranslation('coach');
  const addEntry = useStreamStore((s) => s.addEntry);
  const currentThread = useWorkThreadStore((s) => s.currentThread);
  const addThreadBlock = useWorkThreadStore((s) => s.addThreadBlock);
  const showToast = useToastStore((s) => s.showToast);
  const [line, setLine] = useState('');
  const [count, setCount] = useState(0);
  const [target, setTarget] = useState<BrainDumpTarget>('stream');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setCount(0);
      setLine('');
      setTarget(currentThread ? 'log' : 'stream');
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, currentThread]);

  const flushLine = useCallback(async () => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (target === 'log' && currentThread) {
      await addThreadBlock('log', trimmed);
    } else if (target === 'spark' && currentThread) {
      await addThreadBlock('spark', trimmed);
    } else {
      await addEntry(trimmed, false, { entryType: 'spark' });
    }
    setCount((value) => value + 1);
    setLine('');
  }, [addEntry, addThreadBlock, currentThread, line, target]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void flushLine();
    }
    if (event.key === 'Escape') {
      if (count > 0) {
        showToast({
          message:
            target === 'log' && currentThread
              ? `已写进线程 ${currentThread.title} 的 log：${count} 条`
              : target === 'spark' && currentThread
                ? `已写进线程 ${currentThread.title} 的 spark：${count} 条`
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
          target === 'log' && currentThread
            ? `已写进线程 ${currentThread.title} 的 log：${count} 条`
            : target === 'spark' && currentThread
              ? `已写进线程 ${currentThread.title} 的 spark：${count} 条`
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
            <h2 className="pr-10 text-lg font-bold" style={{ color: 'var(--color-text)' }}>
              {t('Brain dump')}
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('brain_dump_hint')}
            </p>
            {currentThread ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <div
                  className="flex items-center rounded-full border p-0.5"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  {(['log', 'spark'] as BrainDumpTarget[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setTarget(item)}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                        target === item
                          ? 'bg-[var(--color-accent)] text-white'
                          : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <p
                  className="min-w-0 truncate text-[11px]"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  title={currentThread.title}
                >
                  {`写入线程：${currentThread.title}`}
                </p>
              </div>
            ) : null}
            <textarea
              ref={inputRef}
              value={line}
              onChange={(event) => setLine(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                currentThread && target === 'log'
                  ? '把这句记成线程 log'
                  : currentThread && target === 'spark'
                    ? '把这句记成线程 spark'
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
            {count > 0 ? (
              <p className="mt-3 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
                {t('brain_dump_session_count', { count })}
              </p>
            ) : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
