import { History, RefreshCw, ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDataStore } from '../storage/dataStore';
import type { AuditEventRecord, EntityRevisionRecord } from '../storage/dataStore';
import {
  buildTaskHistoryItems,
  formatHistoryActorLabel,
  formatTaskHistoryValue,
  type TaskHistoryFieldKey,
} from '../features/history/taskVersionHistory';

function shortenGroupId(groupId: string | null): string | null {
  if (!groupId) return null;
  return groupId.slice(0, 8);
}

function humanizeUnderscore(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part.toLowerCase(),
    )
    .join(' ');
}

function fieldLabel(field: TaskHistoryFieldKey, t: (key: string) => string): string {
  switch (field) {
    case 'title':
      return t('History field title');
    case 'status':
      return t('History field status');
    case 'body':
      return t('History field body');
    case 'plannedAt':
      return t('History field planned');
    case 'ddl':
      return t('History field due');
    case 'roles':
      return t('History field roles');
    case 'tags':
      return t('History field tags');
    case 'phase':
      return t('History field phase');
    case 'taskType':
      return t('History field task type');
    case 'parentId':
      return t('History field parent');
    case 'subtaskCount':
      return t('History field subtasks');
    case 'reminderCount':
      return t('History field reminders');
    case 'resourceCount':
      return t('History field resources');
    case 'deletedAt':
      return t('History field deleted');
  }
}

function opLabel(op: EntityRevisionRecord['op'], t: (key: string) => string): string {
  switch (op) {
    case 'delete':
      return t('Deleted');
    case 'upsert':
    default:
      return t('Updated');
  }
}

function sourceLabel(event: AuditEventRecord | null, t: (key: string) => string): string | null {
  if (!event) return null;
  switch (event.sourceKind) {
    case 'desktop-ui':
      return t('History source desktop');
    case 'server-api':
      return t('History source server');
    default:
      return humanizeUnderscore(event.sourceKind);
  }
}

function actionLabel(event: AuditEventRecord | null, t: (key: string) => string): string | null {
  if (!event) return null;
  switch (event.action) {
    case 'upsert_task':
      return t('History action upsert_task');
    case 'delete_task':
      return t('History action delete_task');
    case 'delete_linked_task':
      return t('History action delete_linked_task');
    default:
      return humanizeUnderscore(event.action);
  }
}

export function TaskVersionHistorySection({
  taskId,
  revisionSeed,
}: {
  taskId: string;
  revisionSeed: number;
}) {
  const { t } = useTranslation('task');
  const [revisions, setRevisions] = useState<EntityRevisionRecord[]>([]);
  const [events, setEvents] = useState<AuditEventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRevisionId, setExpandedRevisionId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const store = getDataStore();
      const [revisionRows, eventRows] = await Promise.all([
        store.listEntityRevisions('tasks', taskId, 20),
        store.listAuditEvents(20, { entityType: 'tasks', entityId: taskId }),
      ]);
      setRevisions(revisionRows);
      setEvents(eventRows);
      setExpandedRevisionId(revisionRows[0]?.id ?? null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getDataStore().listEntityRevisions('tasks', taskId, 20),
      getDataStore().listAuditEvents(20, { entityType: 'tasks', entityId: taskId }),
    ])
      .then(([revisionRows, eventRows]) => {
        if (cancelled) return;
        setRevisions(revisionRows);
        setEvents(eventRows);
        setExpandedRevisionId(revisionRows[0]?.id ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, revisionSeed]);

  const items = useMemo(() => buildTaskHistoryItems(revisions, events), [revisions, events]);

  return (
    <section
      className="rounded-xl border p-3"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <History size={14} style={{ color: 'var(--color-accent)' }} />
          <div>
            <div className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t('Version history')}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {items.length > 0
                ? t('Recent {{count}} revisions', { count: items.length })
                : t('No version history yet')}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <RefreshCw size={12} />
          {t('Refresh history')}
        </button>
      </div>

      {loading && (
        <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Loading history...')}
        </p>
      )}

      {!loading && error && (
        <div
          className="rounded-lg border px-3 py-2 text-[11px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}
        >
          <div>{t('History unavailable')}</div>
          <div className="mt-1 break-all opacity-80">{error}</div>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('No version history yet')}
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => {
            const isOpen = expandedRevisionId === item.revision.id;
            const source = sourceLabel(item.event, t);
            const actor = formatHistoryActorLabel(item.event);
            const action = actionLabel(item.event, t);
            return (
              <div
                key={item.revision.id}
                className="overflow-hidden rounded-lg border"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedRevisionId((current) =>
                      current === item.revision.id ? null : item.revision.id,
                    )
                  }
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background:
                            item.revision.op === 'delete'
                              ? 'color-mix(in srgb, var(--color-danger) 14%, transparent)'
                              : 'var(--color-accent-soft)',
                          color:
                            item.revision.op === 'delete'
                              ? 'var(--color-danger)'
                              : 'var(--color-accent)',
                        }}
                      >
                        {opLabel(item.revision.op, t)}
                      </span>
                      {action && (
                        <span
                          className="text-[11px] font-medium"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {action}
                        </span>
                      )}
                      <span
                        className="text-[10px]"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        {new Date(item.revision.changedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.changes.length === 0 ? (
                        <span
                          className="text-[11px]"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {t('No material fields changed')}
                        </span>
                      ) : (
                        item.changes.slice(0, 4).map((change) => (
                          <span
                            key={`${item.revision.id}-${change.field}`}
                            className="rounded-full px-2 py-0.5 text-[10px]"
                            style={{
                              background: 'var(--color-bg)',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            {fieldLabel(change.field, t)}
                          </span>
                        ))
                      )}
                    </div>
                    {(source || actor || item.revision.groupId) && (
                      <div
                        className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        {source && (
                          <span>
                            {t('Source')}: {source}
                          </span>
                        )}
                        {actor && (
                          <span>
                            {t('Actor')}: {actor}
                          </span>
                        )}
                        {item.revision.groupId && (
                          <span>
                            {t('Group')}: {shortenGroupId(item.revision.groupId)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronDown
                    size={16}
                    className="shrink-0 transition-transform"
                    style={{
                      color: 'var(--color-text-tertiary)',
                      transform: isOpen ? 'rotate(180deg)' : undefined,
                    }}
                  />
                </button>

                {isOpen && (
                  <div
                    className="space-y-2 px-3 pb-3 pt-0"
                    style={{ borderTop: '1px solid var(--color-border)' }}
                  >
                    {item.changes.length === 0 ? (
                      <div className="pt-2 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        {t('No material fields changed')}
                      </div>
                    ) : (
                      item.changes.map((change) => (
                        <div
                          key={`${item.revision.id}-detail-${change.field}`}
                          className="rounded-lg border p-2"
                          style={{
                            borderColor: 'var(--color-border)',
                            background: 'var(--color-bg)',
                          }}
                        >
                          <div
                            className="text-[11px] font-medium"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {fieldLabel(change.field, t)}
                          </div>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <div>
                              <div
                                className="text-[10px] font-semibold uppercase"
                                style={{ color: 'var(--color-text-tertiary)' }}
                              >
                                {t('Before')}
                              </div>
                              <div
                                className="mt-1 text-[11px] whitespace-pre-wrap break-words"
                                style={{ color: 'var(--color-text)' }}
                              >
                                {formatTaskHistoryValue(change.field, change.beforeValue)}
                              </div>
                            </div>
                            <div>
                              <div
                                className="text-[10px] font-semibold uppercase"
                                style={{ color: 'var(--color-text-tertiary)' }}
                              >
                                {t('After')}
                              </div>
                              <div
                                className="mt-1 text-[11px] whitespace-pre-wrap break-words"
                                style={{ color: 'var(--color-text)' }}
                              >
                                {formatTaskHistoryValue(change.field, change.afterValue)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="mb-2 text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t('Audit trail')}
            </div>
            {events.length === 0 ? (
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('No audit events yet')}
              </div>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 8).map((event) => (
                  <div
                    key={event.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <span className="font-medium">{actionLabel(event, t) ?? event.action}</span>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>
                      {new Date(event.occurredAt).toLocaleString()}
                    </span>
                    {sourceLabel(event, t) && (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>
                        {t('Source')}: {sourceLabel(event, t)}
                      </span>
                    )}
                    {formatHistoryActorLabel(event) && (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>
                        {t('Actor')}: {formatHistoryActorLabel(event)}
                      </span>
                    )}
                    {event.groupId && (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>
                        {t('Group')}: {shortenGroupId(event.groupId)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
