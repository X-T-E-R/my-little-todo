import type { WorkThread, WorkThreadEvent, WorkThreadStatus } from '@my-little-todo/core';
import { Clock3, ListTodo, PauseCircle, Play, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

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
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border p-3"
      style={{
        borderColor: 'var(--color-border)',
        background: 'color-mix(in srgb, var(--color-surface) 96%, var(--color-bg))',
      }}
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-tertiary)' }}>
        {title}
      </div>
      {children}
    </section>
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
  const [mission, setMission] = useState(thread.mission);
  const [summary, setSummary] = useState(thread.resumeCard.summary);
  const [nextStep, setNextStep] = useState(thread.resumeCard.nextStep);
  const [waitingSummary, setWaitingSummary] = useState(thread.resumeCard.waitingSummary ?? '');

  useEffect(() => {
    setMission(thread.mission);
    setSummary(thread.resumeCard.summary);
    setNextStep(thread.resumeCard.nextStep);
    setWaitingSummary(thread.resumeCard.waitingSummary ?? '');
  }, [thread]);

  return (
    <div className="space-y-3">
      <Card title="Runtime">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCheckpoint}
            className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-[11px] font-medium"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <Save size={12} />
            Checkpoint
          </button>
          <button
            type="button"
            onClick={onResume}
            className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold text-white"
            style={{ background: 'var(--color-accent)' }}
          >
            <Play size={12} />
            Resume
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
                {status}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card title="Resume">
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
            placeholder="Summary"
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
          <input
            value={nextStep}
            onChange={(event) => setNextStep(event.target.value)}
            placeholder="Next step"
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
          <input
            value={waitingSummary}
            onChange={(event) => setWaitingSummary(event.target.value)}
            placeholder="Waiting summary"
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
            Save resume card
          </button>
        </div>
      </Card>

      <Card title="Next actions">
        <div className="space-y-2">
          {thread.nextActions.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              No next actions yet.
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
                    Create task
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>

      <Card title="Waiting">
        <div className="space-y-2">
          {thread.waitingFor.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              No waiting conditions.
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
                  {item.satisfied ? 'done' : item.kind}
                </span>
              </button>
            ))
          )}
        </div>
      </Card>

      <Card title="Interrupts">
        <div className="space-y-2">
          {thread.interrupts.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              No captured interrupts.
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

      <Card title="Recent events">
        <div className="space-y-2">
          {events.slice(0, 6).map((event) => (
            <div key={event.id} className="rounded-xl bg-[var(--color-bg)] px-3 py-2">
              <div className="text-[12px]" style={{ color: 'var(--color-text)' }}>
                {event.title}
              </div>
              <div className="mt-1 inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                <Clock3 size={10} />
                {new Date(event.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Sync status">
        <div className="space-y-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <div>Mode: {thread.syncMeta?.mode ?? 'internal'}</div>
          <div>File: {thread.syncMeta?.filePath ?? 'Not linked yet'}</div>
          {thread.syncMeta?.lastImportedAt ? (
            <div>Last import: {new Date(thread.syncMeta.lastImportedAt).toLocaleString()}</div>
          ) : null}
          {thread.syncMeta?.lastExternalModifiedAt ? (
            <div>
              External modified:{' '}
              {new Date(thread.syncMeta.lastExternalModifiedAt).toLocaleString()}
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
