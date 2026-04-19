import type { WorkThread, WorkThreadStatus } from '@my-little-todo/core';
import { Clock3, Play, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function formatStamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

interface WorkThreadResumeCardProps {
  thread: WorkThread;
  onResume: () => void;
  onCheckpoint: () => void;
  onStatusChange: (status: WorkThreadStatus) => void;
}

const STATUS_OPTIONS: WorkThreadStatus[] = [
  'running',
  'ready',
  'waiting',
  'blocked',
  'sleeping',
  'done',
  'archived',
];

export function WorkThreadResumeCard({
  thread,
  onResume,
  onCheckpoint,
  onStatusChange,
}: WorkThreadResumeCardProps) {
  const { t } = useTranslation('think');

  return (
    <section
      className="rounded-[28px] border p-4 sm:p-5"
      style={{
        borderColor: 'var(--color-border)',
        background: 'color-mix(in srgb, var(--color-accent-soft) 26%, var(--color-surface))',
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('thread_resume_card_title')}
          </div>
          <h3 className="mt-2 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
            {thread.title}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="rounded-full bg-[var(--color-bg)] px-2.5 py-1">{thread.lane}</span>
            <span className="rounded-full bg-[var(--color-bg)] px-2.5 py-1">
              {t(`thread_status_${thread.status}`)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg)] px-2.5 py-1">
              <Clock3 size={11} />
              {formatStamp(thread.updatedAt)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
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
          <button
            type="button"
            onClick={onCheckpoint}
            className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-[11px] font-medium"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <Save size={12} />
            {t('thread_checkpoint')}
          </button>
          {thread.status !== 'running' && thread.status !== 'done' && thread.status !== 'archived' ? (
            <button
              type="button"
              onClick={onResume}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold text-white"
              style={{ background: 'var(--color-accent)' }}
            >
              <Play size={12} />
              {t('thread_resume_action')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('thread_resume_summary_label')}
          </div>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>
            {thread.resumeCard.summary || t('thread_resume_summary_empty')}
          </p>
        </div>
        <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('thread_resume_next_step_label')}
          </div>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>
            {thread.resumeCard.nextStep || t('thread_resume_next_step_empty')}
          </p>
        </div>
        <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('thread_waiting_summary_label')}
          </div>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>
            {thread.resumeCard.blockSummary || thread.resumeCard.waitingSummary || t('thread_waiting_summary_empty')}
          </p>
        </div>
      </div>

      {thread.resumeCard.guardrails.length > 0 ? (
        <div className="mt-4 rounded-2xl border p-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('thread_guardrails_label')}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {thread.resumeCard.guardrails.map((guardrail) => (
              <span
                key={guardrail}
                className="rounded-full bg-[var(--color-bg)] px-2.5 py-1 text-[11px]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {guardrail}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
