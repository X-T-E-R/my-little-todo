import { AnimatePresence, motion } from 'framer-motion';
import { Check, History, RefreshCw, X as XIcon, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type RecommendationEvent,
  getTodayStats,
  getWeekStats,
  useBehaviorStore,
} from '../stores/behaviorStore';

interface RecommendationHistoryProps {
  triggerMode?: 'floating' | 'inline';
  className?: string;
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function actionIcon(action: RecommendationEvent['action']) {
  switch (action) {
    case 'accepted':
      return <Check size={12} style={{ color: 'var(--color-success)' }} />;
    case 'rejected':
      return <XCircle size={12} style={{ color: 'var(--color-danger)' }} />;
    case 'swapped':
      return <RefreshCw size={12} style={{ color: 'var(--color-accent)' }} />;
  }
}

function actionLabel(action: RecommendationEvent['action'], t: (key: string) => string): string {
  switch (action) {
    case 'accepted':
      return t('Accepted');
    case 'rejected':
      return t('Rejected');
    case 'swapped':
      return t('Swapped');
  }
}

export function RecommendationHistory({
  triggerMode = 'floating',
  className = '',
}: RecommendationHistoryProps) {
  const { t } = useTranslation('task');
  const [open, setOpen] = useState(false);
  const events = useBehaviorStore((s) => s.events);

  const todayStats = useMemo(() => getTodayStats(events), [events]);
  const weekStats = useMemo(() => getWeekStats(events), [events]);
  const recentEvents = useMemo(() => [...events].reverse().slice(0, 50), [events]);

  const acceptRate =
    todayStats.total > 0 ? Math.round((todayStats.accepted / todayStats.total) * 100) : 0;

  const triggerClassName =
    triggerMode === 'inline'
      ? 'flex w-full items-center justify-between rounded-[var(--radius-card)] border px-3 py-3 text-left text-sm font-medium transition-colors'
      : 'absolute right-4 top-4 z-20 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${triggerClassName} ${className}`.trim()}
        style={
          triggerMode === 'inline'
            ? {
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                borderColor: 'var(--color-border)',
              }
            : {
                color: 'var(--color-text-tertiary)',
                background: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
              }
        }
      >
        {triggerMode === 'inline' ? (
          <>
            <span className="flex items-center gap-2">
              <History size={15} />
              <span>{t('Recommendation history')}</span>
            </span>
            <span
              className="text-[11px] font-semibold tabular-nums"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {recentEvents.length}
            </span>
          </>
        ) : (
          <>
            <History size={12} />
            <span className="hidden sm:inline">{t('Recommendation history')}</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/20"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="fixed bottom-0 right-0 top-0 z-50 w-full max-w-sm overflow-y-auto shadow-2xl"
              style={{
                background: 'var(--color-surface)',
                borderLeft: '1px solid var(--color-border)',
              }}
            >
              <div
                className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
                style={{
                  background: 'var(--color-surface)',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  {t('Recommendation history')}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1 transition-colors"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <XIcon size={16} />
                </button>
              </div>

              <div className="space-y-5 px-5 py-4">
                <section
                  className="rounded-[var(--radius-card)] border p-4"
                  style={{
                    background: 'var(--color-bg)',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  <p className="mb-3 text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                    {t('Statistics')}
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div>
                      <p
                        className="text-[10px] font-medium"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        {t('Today')}
                      </p>
                      <p
                        className="text-lg font-bold tabular-nums"
                        style={{ color: 'var(--color-text)' }}
                      >
                        {todayStats.total}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        {t('Accepted {{accepted}} / Rejected {{rejected}} / Swapped {{swapped}}', {
                          accepted: todayStats.accepted,
                          rejected: todayStats.rejected,
                          swapped: todayStats.swapped,
                        })}
                      </p>
                    </div>
                    <div>
                      <p
                        className="text-[10px] font-medium"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        {t('This week')}
                      </p>
                      <p
                        className="text-lg font-bold tabular-nums"
                        style={{ color: 'var(--color-text)' }}
                      >
                        {weekStats.total}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        {t('Accepted {{accepted}} / Rejected {{rejected}} / Swapped {{swapped}}', {
                          accepted: weekStats.accepted,
                          rejected: weekStats.rejected,
                          swapped: weekStats.swapped,
                        })}
                      </p>
                    </div>
                  </div>
                  {todayStats.total > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <div
                        className="h-1.5 flex-1 overflow-hidden rounded-full"
                        style={{ background: 'var(--color-border)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${acceptRate}%`,
                            background: 'var(--color-success)',
                          }}
                        />
                      </div>
                      <span
                        className="text-[10px] font-semibold tabular-nums"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {t('{{rate}}% acceptance rate', { rate: acceptRate })}
                      </span>
                    </div>
                  )}
                </section>

                <section>
                  <p className="mb-3 text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                    {t('Records')}
                  </p>
                  {recentEvents.length === 0 ? (
                    <p
                      className="py-6 text-center text-xs"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {t('No recommendation records yet')}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {recentEvents.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-start gap-2.5 rounded-[var(--radius-card)] px-3 py-2.5"
                          style={{ background: 'var(--color-bg)' }}
                        >
                          <span
                            className="mt-0.5 shrink-0 font-mono text-[10px] tabular-nums"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            {formatTime(event.timestamp)}
                          </span>
                          <div className="mt-0.5 shrink-0">{actionIcon(event.action)}</div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px]" style={{ color: 'var(--color-text)' }}>
                              <span
                                className="font-medium"
                                style={{
                                  color:
                                    event.action === 'accepted'
                                      ? 'var(--color-success)'
                                      : event.action === 'rejected'
                                        ? 'var(--color-danger)'
                                        : 'var(--color-accent)',
                                }}
                              >
                                {actionLabel(event.action, t)}
                              </span>
                              <span className="mx-1" style={{ color: 'var(--color-text-tertiary)' }}>
                                ·
                              </span>
                              <span className="break-words">{event.taskTitle}</span>
                            </p>
                            {event.rejectionReason && (
                              <p
                                className="mt-0.5 text-[10px]"
                                style={{ color: 'var(--color-text-tertiary)' }}
                              >
                                {t('Reason: {{reason}}', { reason: event.rejectionReason })}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
