import type { WorkThread, WorkThreadEvent, WorkThreadStatus } from '@my-little-todo/core';
import { Clock3, ListTodo, PauseCircle, Play, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildWorkThreadRestoreHistory,
  buildWorkThreadTimelineItems,
  type WorkThreadHistoryItem,
  type WorkThreadHistoryMode,
} from '../../utils/workThreadHistory';

const STATUS_OPTIONS: WorkThreadStatus[] = [
  'running',
  'ready',
  'waiting',
  'blocked',
  'sleeping',
  'done',
  'archived',
];

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section
      className="px-4 py-4"
      style={{
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {title}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function HistoryEventCard({ item }: { item: WorkThreadHistoryItem }) {
  return (
    <div
      className="border-l px-3 py-2"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-accent) 24%, var(--color-border))',
        background: 'transparent',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>
            {item.title}
          </div>
          {item.summary ? (
            <div
              className="mt-1 text-[11px] leading-5"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {item.summary}
            </div>
          ) : null}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
          style={{
            background: 'var(--color-accent-soft)',
            color: 'var(--color-accent)',
          }}
        >
          {item.metaLabel}
        </span>
      </div>
      <div
        className="mt-2 inline-flex items-center gap-1 text-[10px]"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        <Clock3 size={10} />
        {new Date(item.createdAt).toLocaleString()}
      </div>
    </div>
  );
}

function HistorySection({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: WorkThreadHistoryItem[];
  emptyText: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
        {title}
      </div>
      {items.length === 0 ? (
        <div
          className="border-l px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {emptyText}
        </div>
      ) : (
        items.map((item) => <HistoryEventCard key={item.id} item={item} />)
      )}
    </div>
  );
}

export function WorkThreadRuntimeSidebar({
  thread,
  events,
  onResume,
  onCheckpoint,
  onStatusChange,
  onUpdateMission,
  onUpdateResumeCard,
  onToggleWaiting,
  onToggleNextAction,
  onCreateTaskFromNextAction,
  onResolveInterrupt,
}: {
  thread: WorkThread;
  events: WorkThreadEvent[];
  onResume: () => void;
  onCheckpoint: () => void;
  onStatusChange: (status: WorkThreadStatus) => void;
  onUpdateMission: (mission: string) => void;
  onUpdateResumeCard: (patch: {
    summary: string;
    nextStep: string;
    waitingSummary?: string;
  }) => void;
  onToggleWaiting: (id: string) => void;
  onToggleNextAction: (id: string) => void;
  onCreateTaskFromNextAction: (id: string) => void;
  onResolveInterrupt: (id: string) => void;
}) {
  const { t } = useTranslation('think');
  const [mission, setMission] = useState(thread.mission);
  const [summary, setSummary] = useState(thread.resumeCard.summary);
  const [nextStep, setNextStep] = useState(thread.resumeCard.nextStep);
  const [waitingSummary, setWaitingSummary] = useState(thread.resumeCard.waitingSummary ?? '');
  const [historyMode, setHistoryMode] = useState<WorkThreadHistoryMode>('restore');

  useEffect(() => {
    setMission(thread.mission);
    setSummary(thread.resumeCard.summary);
    setNextStep(thread.resumeCard.nextStep);
    setWaitingSummary(thread.resumeCard.waitingSummary ?? '');
  }, [thread]);

  const restoreHistory = buildWorkThreadRestoreHistory(events, 4, t);
  const timelineItems = buildWorkThreadTimelineItems(events, 12, t);

  return (
    <div className="flex flex-col">
      <Card title={t('thread_runtime_card_title')}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCheckpoint}
            className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-[11px] font-medium"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <Save size={12} />
            {t('thread_checkpoint_button')}
          </button>
          <button
            type="button"
            onClick={onResume}
            className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold text-white"
            style={{ background: 'var(--color-accent)' }}
          >
            <Play size={12} />
            {t('thread_resume_button')}
          </button>
          <select
            value={thread.status}
            onChange={(event) => onStatusChange(event.target.value as WorkThreadStatus)}
            className="rounded-xl border px-3 py-2 text-[11px] font-medium"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)',
              background: 'var(--color-surface)',
            }}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {t(`thread_status_${status}`)}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card title={t('thread_resume_card_title')}>
        <div className="space-y-2">
          <textarea
            value={mission}
            onChange={(event) => setMission(event.target.value)}
            onBlur={() => onUpdateMission(mission)}
            rows={2}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={3}
            placeholder={t('thread_resume_summary_placeholder')}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
          <input
            value={nextStep}
            onChange={(event) => setNextStep(event.target.value)}
            placeholder={t('thread_resume_next_step_placeholder')}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
          <input
            value={waitingSummary}
            onChange={(event) => setWaitingSummary(event.target.value)}
            placeholder={t('thread_resume_waiting_placeholder')}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
          <button
            type="button"
            onClick={() =>
              onUpdateResumeCard({
                summary,
                nextStep,
                waitingSummary: waitingSummary || undefined,
              })
            }
            className="rounded-xl px-3 py-2 text-xs font-semibold text-white"
            style={{ background: 'var(--color-accent)' }}
          >
            {t('thread_resume_save')}
          </button>
        </div>
      </Card>

      <Card title={t('thread_next_actions_title')}>
        <div className="space-y-2">
          {thread.nextActions.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t('thread_next_actions_empty')}
            </div>
          ) : (
            thread.nextActions.slice(0, 6).map((action) => (
              <div key={action.id} className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleNextAction(action.id)}
                    className="mt-0.5 rounded"
                    style={{ color: action.done ? 'var(--color-success, #16a34a)' : 'var(--color-text-tertiary)' }}
                  >
                    <ListTodo size={14} />
                  </button>
                  <div className="min-w-0 flex-1 text-sm" style={{ color: 'var(--color-text)' }}>
                    {action.text}
                  </div>
                </div>
                {!action.linkedTaskId ? (
                  <button
                    type="button"
                    onClick={() => onCreateTaskFromNextAction(action.id)}
                    className="mt-2 text-[11px] font-medium"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    {t('thread_create_task')}
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>

      <Card title={t('thread_waiting_title')}>
        <div className="space-y-2">
          {thread.waitingFor.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t('thread_waiting_empty')}
            </div>
          ) : (
            thread.waitingFor.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggleWaiting(item.id)}
                className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                <span className="min-w-0 flex-1">{item.title}</span>
                <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {item.satisfied ? t('thread_status_done') : t(`thread_waiting_kind_${item.kind}`)}
                </span>
              </button>
            ))
          )}
        </div>
      </Card>

      <Card title={t('thread_interrupts_title')}>
        <div className="space-y-2">
          {thread.interrupts.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t('thread_interrupt_empty')}
            </div>
          ) : (
            thread.interrupts.slice(0, 4).map((interrupt) => (
              <button
                key={interrupt.id}
                type="button"
                onClick={() => onResolveInterrupt(interrupt.id)}
                className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                <span className="min-w-0 flex-1">{interrupt.title}</span>
                <PauseCircle size={14} style={{ color: interrupt.resolved ? 'var(--color-success, #16a34a)' : 'var(--color-text-tertiary)' }} />
              </button>
            ))
          )}
        </div>
      </Card>

      <Card
        title={t('thread_history_title')}
        action={
          <div
            className="inline-flex rounded-full border p-0.5"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
          >
            <button
              type="button"
              onClick={() => setHistoryMode('restore')}
              className="rounded-full px-2.5 py-1 text-[10px] font-medium"
              style={{
                background: historyMode === 'restore' ? 'var(--color-accent-soft)' : 'transparent',
                color: historyMode === 'restore' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              }}
            >
              {t('thread_history_restore_view')}
            </button>
            <button
              type="button"
              onClick={() => setHistoryMode('timeline')}
              className="rounded-full px-2.5 py-1 text-[10px] font-medium"
              style={{
                background: historyMode === 'timeline' ? 'var(--color-accent-soft)' : 'transparent',
                color: historyMode === 'timeline' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              }}
            >
              {t('thread_history_timeline_view')}
            </button>
          </div>
        }
      >
        {events.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('thread_history_empty')}
          </div>
        ) : historyMode === 'restore' ? (
          <div className="space-y-3">
            <HistorySection
              title={t('thread_history_recent_captures')}
              items={restoreHistory.captures}
              emptyText={t('thread_history_section_empty')}
            />
            <HistorySection
              title={t('thread_history_recent_decisions')}
              items={restoreHistory.decisions}
              emptyText={t('thread_history_section_empty')}
            />
            <HistorySection
              title={t('thread_history_next_step_changes')}
              items={restoreHistory.nextSteps}
              emptyText={t('thread_history_section_empty')}
            />
            <HistorySection
              title={t('thread_history_blocker_changes')}
              items={restoreHistory.blockers}
              emptyText={t('thread_history_section_empty')}
            />
          </div>
        ) : (
          <div className="space-y-2">
            {timelineItems.length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('thread_timeline_empty')}
              </div>
            ) : (
              timelineItems.map((item) => <HistoryEventCard key={item.id} item={item} />)
            )}
          </div>
        )}
      </Card>

      <Card title={t('thread_sync_status_title')}>
        <div className="space-y-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <div>
            {t('thread_sync_status_mode')}:{' '}
            {thread.syncMeta?.mode === 'hybrid'
              ? t('thread_sync_status_mode_hybrid')
              : t('thread_sync_status_mode_internal')}
          </div>
          <div>
            {t('thread_sync_status_file')}:{' '}
            {thread.syncMeta?.filePath ?? t('thread_sync_status_unlinked')}
          </div>
          {thread.syncMeta?.lastImportedAt ? (
            <div>
              {t('thread_sync_status_last_import')}:{' '}
              {new Date(thread.syncMeta.lastImportedAt).toLocaleString()}
            </div>
          ) : null}
          {thread.syncMeta?.lastExternalModifiedAt ? (
            <div>
              {t('thread_sync_status_external_modified')}:{' '}
              {new Date(thread.syncMeta.lastExternalModifiedAt).toLocaleString()}
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
