import type {
  WorkThreadBlockView,
  StreamEntry,
  WorkThread,
  WorkThreadEvent,
  WorkThreadIntentState,
  WorkThreadStatus,
} from '@my-little-todo/core';
import { buildWorkThreadBlockViews } from '@my-little-todo/core';
import { Clock3, ListTodo, Play, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  relatedSparks,
  onResume,
  onCheckpoint,
  onStatusChange,
  onToggleWaiting,
  onToggleNextAction,
  onCreateTaskFromNextAction,
  onSetIntentState,
  onPromoteIntent,
  onCaptureIntentAsSpark,
  onCreateThreadFromIntent,
  onResolveInterrupt,
  onOpenSparkInStream,
  onCreateThreadFromSpark,
  onCreateTaskFromSpark,
  onArchiveSpark,
}: {
  thread: WorkThread;
  events: WorkThreadEvent[];
  relatedSparks: StreamEntry[];
  onResume: () => void;
  onCheckpoint: () => void;
  onStatusChange: (status: WorkThreadStatus) => void;
  onToggleWaiting: (id: string) => void;
  onToggleNextAction: (id: string) => void;
  onCreateTaskFromNextAction: (id: string) => void;
  onSetIntentState: (id: string, state: WorkThreadIntentState) => void;
  onPromoteIntent: (id: string) => void;
  onCaptureIntentAsSpark: (id: string) => void;
  onCreateThreadFromIntent: (id: string) => void;
  onResolveInterrupt: (id: string) => void;
  onOpenSparkInStream: (entryId: string) => void;
  onCreateThreadFromSpark: (entryId: string) => void;
  onCreateTaskFromSpark: (entryId: string) => void;
  onArchiveSpark: (entryId: string) => void;
}) {
  const { t } = useTranslation('think');
  const [historyMode, setHistoryMode] = useState<WorkThreadHistoryMode>('restore');

  const restoreHistory = buildWorkThreadRestoreHistory(events, 4, t);
  const timelineItems = buildWorkThreadTimelineItems(events, 12, t);
  const blocks = useMemo(() => buildWorkThreadBlockViews(thread), [thread]);
  const toggleBlock = (block: WorkThreadBlockView) => {
    if (block.sourceKind === 'interrupt') {
      onResolveInterrupt(block.id);
      return;
    }
    onToggleWaiting(block.id);
  };

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
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
              Mission
            </div>
            <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
              {thread.mission || '—'}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
              {t('thread_resume_summary_placeholder')}
            </div>
            <div className="rounded-xl border px-3 py-2 text-sm leading-6" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
              {thread.resumeCard.summary || '—'}
            </div>
          </div>
          <div className="grid gap-2">
            <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>
              <div className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('thread_resume_next_step_placeholder')}
              </div>
              <div className="mt-1" style={{ color: 'var(--color-text)' }}>
                {thread.resumeCard.nextStep || '—'}
              </div>
            </div>
            <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>
              <div className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('thread_resume_waiting_placeholder')}
              </div>
              <div className="mt-1" style={{ color: 'var(--color-text)' }}>
                {thread.resumeCard.blockSummary ?? thread.resumeCard.waitingSummary ?? '—'}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card title={t('thread_intents_title')}>
        <div className="space-y-2">
          {thread.intents.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t('thread_intents_empty')}
            </div>
          ) : (
            thread.intents.slice(0, 8).map((intent) => (
              <div
                key={intent.id}
                className="rounded-xl border px-3 py-2"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                      {intent.text}
                    </div>
                    {intent.detail ? (
                      <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                        {intent.detail}
                      </div>
                    ) : null}
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
                    style={{
                      background: 'var(--color-bg)',
                      color: 'var(--color-text-tertiary)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {t(`thread_intent_state_${intent.state}`)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  {intent.state !== 'done' ? (
                    <button
                      type="button"
                      onClick={() => onPromoteIntent(intent.id)}
                      style={{ color: 'var(--color-accent)' }}
                    >
                      {t('thread_intent_to_next')}
                    </button>
                  ) : null}
                  {!intent.linkedSparkId ? (
                    <button
                      type="button"
                      onClick={() => onCaptureIntentAsSpark(intent.id)}
                      style={{ color: 'var(--color-accent)' }}
                    >
                      {t('thread_intent_to_spark')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onCreateThreadFromIntent(intent.id)}
                    style={{ color: 'var(--color-accent)' }}
                  >
                    {t('thread_intent_new_thread')}
                  </button>
                  {intent.state !== 'parked' ? (
                    <button
                      type="button"
                      onClick={() => onSetIntentState(intent.id, 'parked')}
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {t('thread_intent_park')}
                    </button>
                  ) : null}
                  {intent.state !== 'archived' ? (
                    <button
                      type="button"
                      onClick={() => onSetIntentState(intent.id, 'archived')}
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {t('thread_intent_archive')}
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
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

      <Card title={t('thread_related_sparks_title')}>
        <div className="space-y-2">
          {relatedSparks.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t('thread_related_sparks_empty')}
            </div>
          ) : (
            relatedSparks.slice(0, 8).map((spark) => (
              <div
                key={spark.id}
                className="rounded-xl border px-3 py-2"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                  {spark.content}
                </div>
                <div
                  className="mt-1 text-[10px]"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t(`thread_related_sparks_state_${spark.threadMeta?.sparkState ?? 'open'}`)}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => onOpenSparkInStream(spark.id)}
                    style={{ color: 'var(--color-accent)' }}
                  >
                    {t('thread_related_sparks_open_stream')}
                  </button>
                  {!spark.threadMeta?.promotedThreadId ? (
                    <button
                      type="button"
                      onClick={() => onCreateThreadFromSpark(spark.id)}
                      style={{ color: 'var(--color-accent)' }}
                    >
                      {t('thread_related_sparks_new_thread')}
                    </button>
                  ) : null}
                  {!spark.threadMeta?.linkedTaskId ? (
                    <button
                      type="button"
                      onClick={() => onCreateTaskFromSpark(spark.id)}
                      style={{ color: 'var(--color-accent)' }}
                    >
                      {t('thread_related_sparks_new_task')}
                    </button>
                  ) : null}
                  {spark.threadMeta?.sparkState !== 'archived' ? (
                    <button
                      type="button"
                      onClick={() => onArchiveSpark(spark.id)}
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {t('thread_related_sparks_archive')}
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card title={t('thread_blockers_title')}>
        <div className="space-y-2">
          {blocks.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t('thread_blockers_empty')}
            </div>
          ) : (
            blocks.slice(0, 8).map((block) => (
              <button
                key={`${block.sourceKind}-${block.id}`}
                type="button"
                onClick={() => toggleBlock(block)}
                className="flex w-full items-start justify-between rounded-xl border px-3 py-2 text-left"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{block.title}</div>
                  {block.detail ? (
                    <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {block.detail}
                    </div>
                  ) : null}
                </div>
                <div className="ml-3 flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t(`thread_block_source_${block.sourceKind ?? 'waiting'}`)}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t(`thread_block_state_${block.state}`)}
                  </span>
                </div>
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
