import type { WorkThread, WorkThreadStatus } from '@my-little-todo/core';
import { ArrowRight, Play, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const STATUS_ORDER: WorkThreadStatus[] = [
  'running',
  'ready',
  'waiting',
  'blocked',
  'sleeping',
  'done',
  'archived',
];

function formatStamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

function compact(text: string | undefined, max = 120): string {
  const normalized = text?.replace(/\s+/g, ' ').trim() ?? '';
  if (!normalized) return '';
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

interface WorkThreadBoardProps {
  threads: WorkThread[];
  loading: boolean;
  roleNames: Record<string, string>;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}

export function WorkThreadBoard({
  threads,
  loading,
  roleNames,
  onCreate,
  onOpen,
  onResume,
  onDelete,
}: WorkThreadBoardProps) {
  const { t } = useTranslation('think');
  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: threads.filter((thread) => thread.status === status),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {t('thread_board_title')}
          </h2>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('thread_board_subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white"
          style={{ background: 'var(--color-accent)' }}
        >
          <Plus size={14} />
          {t('thread_new')}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('loading_session')}
        </div>
      ) : threads.length === 0 ? (
        <div
          className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
        >
          <p className="text-sm font-medium">{t('thread_empty_title')}</p>
          <p className="mt-1 text-xs">{t('thread_empty_hint')}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {groups.map((group) => (
            <section key={group.status}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t(`thread_status_${group.status}`)}
                </h3>
                <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {group.items.length}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((thread) => {
                  const nextStep = compact(thread.resumeCard.nextStep, 72);
                  const summary = compact(thread.resumeCard.summary || thread.mission, 140);
                  const resumable = thread.status === 'ready' || thread.status === 'sleeping';
                  return (
                    <article
                      key={thread.id}
                      className="rounded-2xl border p-4"
                      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                            {thread.title}
                          </div>
                          <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                            {formatStamp(thread.updatedAt)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDelete(thread.id)}
                          className="rounded-lg p-1"
                          style={{ color: 'var(--color-text-tertiary)' }}
                          aria-label={t('delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <p className="mt-3 text-xs leading-6" style={{ color: 'var(--color-text-secondary)' }}>
                        {summary || t('thread_empty_hint')}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                        <span className="rounded-full bg-[var(--color-bg)] px-2.5 py-1">{thread.lane}</span>
                        <span className="rounded-full bg-[var(--color-bg)] px-2.5 py-1">
                          {t('thread_context_count', { count: thread.contextItems.length })}
                        </span>
                        <span className="rounded-full bg-[var(--color-bg)] px-2.5 py-1">
                          {t('thread_actions_count', { count: thread.nextActions.length })}
                        </span>
                      </div>

                      {thread.roleId && roleNames[thread.roleId] ? (
                        <div className="mt-2 text-[11px]" style={{ color: 'var(--color-accent)' }}>
                          {roleNames[thread.roleId]}
                        </div>
                      ) : null}

                      {nextStep ? (
                        <div
                          className="mt-3 rounded-xl px-3 py-2 text-[11px]"
                          style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
                        >
                          <span className="font-medium" style={{ color: 'var(--color-text)' }}>
                            {t('thread_resume_next_step_label')}
                          </span>{' '}
                          {nextStep}
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onOpen(thread.id)}
                          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium"
                          style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
                        >
                          <ArrowRight size={12} />
                          {t('thread_open_workspace')}
                        </button>
                        {resumable ? (
                          <button
                            type="button"
                            onClick={() => onResume(thread.id)}
                            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium"
                            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                          >
                            <Play size={12} />
                            {t('thread_resume_action')}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
