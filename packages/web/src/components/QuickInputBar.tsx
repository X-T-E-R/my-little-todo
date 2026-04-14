import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Hash, Send, Tag, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoleStore, useStreamStore, useTaskStore, useWorkThreadStore } from '../stores';

interface QuickInputBarProps {
  open: boolean;
  onClose: () => void;
}

const DDL_TYPES = ['soft', 'commitment', 'hard'] as const;
type DdlType = (typeof DDL_TYPES)[number];
type QuickInputTarget = 'task' | 'thread';

export function QuickInputBar({ open, onClose }: QuickInputBarProps) {
  const { t } = useTranslation('stream');
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [showMeta, setShowMeta] = useState(false);
  const [ddlDate, setDdlDate] = useState('');
  const [ddlType, setDdlType] = useState<DdlType>('soft');
  const [tags, setTags] = useState('');
  const [target, setTarget] = useState<QuickInputTarget>('task');
  const addEntry = useStreamStore((s) => s.addEntry);
  const roles = useRoleStore((s) => s.roles);
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const currentThread = useWorkThreadStore((s) => s.currentThread);
  const addTaskToThread = useWorkThreadStore((s) => s.addTaskToThread);

  useEffect(() => {
    if (open) {
      setTarget(currentThread ? 'thread' : 'task');
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setTitle('');
      setShowMeta(false);
      setDdlDate('');
      setDdlType('soft');
      setTags('');
      setTarget('task');
    }
  }, [open, currentThread]);

  const handleSubmit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const parsedDdl = ddlDate ? new Date(ddlDate) : undefined;
    const parsedTags = tags
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const entry = await addEntry(trimmed, true, {
        ddl: parsedDdl,
        ddlType: ddlDate ? ddlType : undefined,
        tags: parsedTags.length > 0 ? parsedTags : undefined,
      });
      if (target === 'thread' && currentThread && entry.extractedTaskId) {
        const task = useTaskStore.getState().tasks.find((item) => item.id === entry.extractedTaskId);
        if (task) {
          await addTaskToThread(task, 'current');
        }
      }
    } catch {
      return;
    }

    setTitle('');
    setDdlDate('');
    setDdlType('soft');
    setTags('');
    setShowMeta(false);
    onClose();
  }, [title, ddlDate, ddlType, tags, addEntry, addTaskToThread, currentThread, onClose, target]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [handleSubmit, onClose],
  );

  const currentRole = roles.find((r) => r.id === currentRoleId);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="absolute left-0 right-0 top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 shadow-lg backdrop-blur-md"
        >
          <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-2">
            {currentRole && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                style={{ backgroundColor: currentRole.color || 'var(--color-accent)' }}
              >
                {currentRole.name}
              </span>
            )}

            {currentThread && (
              <div
                className="flex shrink-0 items-center rounded-full border p-0.5"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <button
                  type="button"
                  onClick={() => setTarget('thread')}
                  className={`rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                    target === 'thread'
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                  }`}
                  title={currentThread.title}
                >
                  {t('Thread')}
                </button>
                <button
                  type="button"
                  onClick={() => setTarget('task')}
                  className={`rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                    target === 'task'
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                  }`}
                >
                  {t('Task')}
                </button>
              </div>
            )}

            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                currentThread && target === 'thread'
                  ? t('Quick create task in current thread...', { ns: 'stream' })
                  : t('Quick create task...', { ns: 'stream' })
              }
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] outline-none"
            />

            <button
              type="button"
              onClick={() => setShowMeta((v) => !v)}
              className={`rounded p-1.5 transition-colors ${showMeta ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}
              title={t('More options', { ns: 'stream' })}
            >
              <Hash size={16} />
            </button>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!title.trim()}
              className="rounded p-1.5 text-[var(--color-accent)] transition-opacity disabled:opacity-30"
            >
              <Send size={16} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]"
            >
              <X size={16} />
            </button>
          </div>

          <AnimatePresence>
            {showMeta && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3 border-t border-[var(--color-border)]/50 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={14} className="text-[var(--color-text-tertiary)]" />
                    <input
                      type="datetime-local"
                      value={ddlDate}
                      onChange={(e) => setDdlDate(e.target.value)}
                      className="rounded border border-[var(--color-border)] bg-transparent px-2 py-0.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>

                  {ddlDate && (
                    <div className="flex gap-1">
                      {DDL_TYPES.map((dt) => (
                        <button
                          key={dt}
                          type="button"
                          onClick={() => setDdlType(dt)}
                          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            ddlType === dt
                              ? 'bg-[var(--color-accent)] text-white'
                              : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                          }`}
                        >
                          {dt}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <Tag size={14} className="text-[var(--color-text-tertiary)]" />
                    <input
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder={t('Tags (space separated)', { ns: 'stream' })}
                      className="w-32 rounded border border-[var(--color-border)] bg-transparent px-2 py-0.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
