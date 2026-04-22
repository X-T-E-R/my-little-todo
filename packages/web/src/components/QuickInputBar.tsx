import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Hash, Send, Tag, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoleStore, useStreamStore, useWorkThreadStore } from '../stores';

interface QuickInputBarProps {
  open: boolean;
  onClose: () => void;
}

const DDL_TYPES = ['soft', 'commitment', 'hard'] as const;
type DdlType = (typeof DDL_TYPES)[number];
type QuickInputTarget = 'task' | 'mission' | 'spark' | 'log';

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
  const addThreadBlock = useWorkThreadStore((s) => s.addThreadBlock);

  useEffect(() => {
    if (open) {
      setTarget(currentThread ? 'log' : 'task');
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
      .map((tag) => tag.trim())
      .filter(Boolean);

    try {
      if (currentThread) {
        await addThreadBlock(target, trimmed, {
          title: target === 'log' ? undefined : trimmed,
        });
      } else {
        await addEntry(trimmed, true, {
          ddl: parsedDdl,
          ddlType: ddlDate ? ddlType : undefined,
          tags: parsedTags.length > 0 ? parsedTags : undefined,
        });
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
  }, [title, ddlDate, ddlType, tags, addEntry, addThreadBlock, currentThread, onClose, target]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void handleSubmit();
      }
      if (event.key === 'Escape') onClose();
    },
    [handleSubmit, onClose],
  );

  const currentRole = roles.find((role) => role.id === currentRoleId);

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

            {currentThread ? (
              <div
                className="flex shrink-0 items-center rounded-full border p-0.5"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {(['mission', 'task', 'spark', 'log'] as QuickInputTarget[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTarget(item)}
                    className={`rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                      target === item
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}

            <input
              ref={inputRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                currentThread
                  ? `在线程里快速加一个 /${target}`
                  : t('Quick create task...', { ns: 'stream' })
              }
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] outline-none"
            />

            <button
              type="button"
              onClick={() => setShowMeta((value) => !value)}
              disabled={Boolean(currentThread)}
              className={`rounded p-1.5 transition-colors ${
                showMeta
                  ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
              }`}
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
            {showMeta && !currentThread && (
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
                      onChange={(event) => setDdlDate(event.target.value)}
                      className="rounded border border-[var(--color-border)] bg-transparent px-2 py-0.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>

                  {ddlDate && (
                    <div className="flex gap-1">
                      {DDL_TYPES.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setDdlType(item)}
                          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            ddlType === item
                              ? 'bg-[var(--color-accent)] text-white'
                              : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <Tag size={14} className="text-[var(--color-text-tertiary)]" />
                    <input
                      value={tags}
                      onChange={(event) => setTags(event.target.value)}
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
