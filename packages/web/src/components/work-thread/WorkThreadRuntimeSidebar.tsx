import {
  buildWorkThreadBlockStats,
  listWorkThreadBlocks,
  type StreamEntry,
  type WorkThread,
  type WorkThreadBlock,
  type WorkThreadEvent,
  type WorkThreadStatus,
} from '@my-little-todo/core';
import { Clock3, Play, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildWorkThreadTimelineItems,
  type WorkThreadHistoryItem,
} from '../../utils/workThreadHistory';

const STATUS_OPTIONS: WorkThreadStatus[] = ['active', 'paused', 'done', 'archived'];
const STATUS_LABEL: Record<string, string> = {
  active: '运行中',
  paused: '暂停中',
  done: '已完成',
  archived: '已归档',
};

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
      }}
    >
      <div className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>
        {item.title}
      </div>
      {item.summary ? (
        <div className="mt-1 text-[11px] leading-5" style={{ color: 'var(--color-text-secondary)' }}>
          {item.summary}
        </div>
      ) : null}
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

function BlockCard({
  block,
  onCreateTask,
  onPromoteToStream,
  onOpenSparkInStream,
}: {
  block: WorkThreadBlock;
  onCreateTask: (blockId: string) => void;
  onPromoteToStream: (blockId: string) => void;
  onOpenSparkInStream: (entryId: string) => void;
}) {
  const title =
    block.title?.trim() ||
    block.body
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ||
    (block.kind === 'spark' ? 'Spark' : block.kind === 'log' ? 'Log' : 'Task');

  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm" style={{ color: 'var(--color-text)' }}>
            {title}
          </div>
          {block.kind === 'task' ? (
            <div className="mt-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {block.taskAlias === 'mission' ? 'Mission' : 'Task'}
              {block.status ? ` · ${block.status}` : ''}
            </div>
          ) : (
            <div className="mt-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {block.kind === 'spark' ? 'Spark' : 'Log'}
            </div>
          )}
          {block.body.trim() ? (
            <div className="mt-2 text-[11px] leading-5" style={{ color: 'var(--color-text-secondary)' }}>
              {block.body}
            </div>
          ) : null}
          {block.kind === 'task' && (block.resume || block.pause?.reason) ? (
            <div className="mt-2 space-y-1 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
              {block.resume ? <div>{`Next: ${block.resume}`}</div> : null}
              {block.pause?.reason ? <div>{`Pause: ${block.pause.reason}`}</div> : null}
              {block.pause?.then ? <div>{`Pause then: ${block.pause.then}`}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        {block.kind === 'task' && !block.linkedTaskId ? (
          <button type="button" onClick={() => onCreateTask(block.id)} style={{ color: 'var(--color-accent)' }}>
            建任务
          </button>
        ) : null}
        {block.kind === 'task' && block.linkedTaskId ? (
          <span style={{ color: 'var(--color-text-tertiary)' }}>{`Task: ${block.linkedTaskId}`}</span>
        ) : null}
        {!block.promotedStreamEntryId ? (
          <button type="button" onClick={() => onPromoteToStream(block.id)} style={{ color: 'var(--color-accent)' }}>
            提到 Stream
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenSparkInStream(block.promotedStreamEntryId!)}
            style={{ color: 'var(--color-accent)' }}
          >
            打开 Stream
          </button>
        )}
      </div>
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
  onUpdateThreadState,
  onPromoteBlockToStream,
  onCreateTaskFromBlock,
  onOpenSparkInStream,
  focusRequest,
  onFocusConsumed,
}: {
  thread: WorkThread;
  events: WorkThreadEvent[];
  relatedSparks: StreamEntry[];
  onResume: () => void;
  onCheckpoint: () => void;
  onStatusChange: (status: WorkThreadStatus) => void;
  onUpdateThreadState: (patch: {
    title?: string;
    status?: WorkThreadStatus;
    resume?: string;
    pauseReason?: string;
    pauseThen?: string;
  }) => void;
  onPromoteBlockToStream: (blockId: string) => void;
  onCreateTaskFromBlock: (blockId: string) => void;
  onOpenSparkInStream: (entryId: string) => void;
  focusRequest?: 'next' | 'pause' | null;
  onFocusConsumed?: () => void;
}) {
  const { t } = useTranslation('think');
  const [resume, setResume] = useState(thread.resume ?? '');
  const [pauseReason, setPauseReason] = useState(thread.pause?.reason ?? '');
  const [pauseThen, setPauseThen] = useState(thread.pause?.then ?? '');
  const resumeRef = useRef<HTMLTextAreaElement>(null);
  const pauseReasonRef = useRef<HTMLTextAreaElement>(null);
  const stats = useMemo(() => buildWorkThreadBlockStats(thread), [thread]);
  const taskBlocks = useMemo(
    () => listWorkThreadBlocks(thread).filter((block) => block.kind === 'task'),
    [thread],
  );
  const noteBlocks = useMemo(
    () => listWorkThreadBlocks(thread).filter((block) => block.kind !== 'task'),
    [thread],
  );
  const timelineItems = buildWorkThreadTimelineItems(events, 12, t);

  useEffect(() => {
    setResume(thread.resume ?? '');
    setPauseReason(thread.pause?.reason ?? '');
    setPauseThen(thread.pause?.then ?? '');
  }, [thread]);

  useEffect(() => {
    if (focusRequest === 'next') {
      resumeRef.current?.focus();
      resumeRef.current?.setSelectionRange(resume.length, resume.length);
      onFocusConsumed?.();
      return;
    }
    if (focusRequest === 'pause') {
      pauseReasonRef.current?.focus();
      pauseReasonRef.current?.setSelectionRange(pauseReason.length, pauseReason.length);
      onFocusConsumed?.();
    }
  }, [focusRequest, onFocusConsumed, pauseReason.length, resume.length]);

  return (
    <div className="flex flex-col">
      <Card title="Thread cockpit">
        <div
          className="mb-4 rounded-2xl border px-3 py-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-accent) 18%, var(--color-border))',
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--color-accent-soft) 64%, var(--color-surface)), var(--color-surface))',
          }}
        >
          <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {thread.title}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
            <span
              className="rounded-full px-2.5 py-1"
              style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
            >
              {STATUS_LABEL[thread.status] ?? thread.status}
            </span>
            <span
              className="rounded-full px-2.5 py-1"
              style={{ background: 'var(--color-bg)', color: 'var(--color-text-tertiary)' }}
            >
              {`Mission ${stats.missions} · Task ${stats.tasks}`}
            </span>
          </div>
          {thread.resume || thread.pause?.reason ? (
            <div className="mt-3 space-y-1 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
              {thread.resume ? <div>{`Next: ${thread.resume}`}</div> : null}
              {thread.pause?.reason ? <div>{`Pause: ${thread.pause.reason}`}</div> : null}
              {thread.pause?.then ? <div>{`Pause then: ${thread.pause.then}`}</div> : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCheckpoint}
            className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-[11px] font-medium"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <Save size={12} />
            保存检查点
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
                {STATUS_LABEL[status] ?? status}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card title="Thread state">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              Next
            </div>
            <textarea
              ref={resumeRef}
              value={resume}
              onChange={(event) => setResume(event.target.value)}
              rows={3}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
            />
          </div>
          <div className="space-y-1">
            <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              Pause reason
            </div>
            <textarea
              ref={pauseReasonRef}
              value={pauseReason}
              onChange={(event) => setPauseReason(event.target.value)}
              rows={3}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
            />
          </div>
          <div className="space-y-1">
            <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              Pause then
            </div>
            <textarea
              value={pauseThen}
              onChange={(event) => setPauseThen(event.target.value)}
              rows={2}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
            />
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateThreadState({
                resume,
                pauseReason,
                pauseThen,
              })
            }
            className="rounded-xl px-3 py-2 text-[11px] font-semibold text-white"
            style={{ background: 'var(--color-accent)' }}
          >
            保存线程状态
          </button>
        </div>
      </Card>

      <Card title="Overview">
        <div className="grid grid-cols-2 gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
          <div className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>{`Mission ${stats.missions}`}</div>
          <div className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>{`Task ${stats.tasks}`}</div>
          <div className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>{`Spark ${stats.sparks}`}</div>
          <div className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>{`Log ${stats.logs}`}</div>
          <div className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>{`关联 sparks ${relatedSparks.length}`}</div>
          <div className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>{`总块数 ${stats.total}`}</div>
        </div>
      </Card>

      <Card title="Mission / Task">
        <div className="space-y-2">
          {taskBlocks.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              还没有 mission 或 task。
            </div>
          ) : (
            taskBlocks.map((block) => (
              <BlockCard
                key={block.id}
                block={block}
                onCreateTask={onCreateTaskFromBlock}
                onPromoteToStream={onPromoteBlockToStream}
                onOpenSparkInStream={onOpenSparkInStream}
              />
            ))
          )}
        </div>
      </Card>

      <Card title="Spark / Log">
        <div className="space-y-2">
          {noteBlocks.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              还没有 spark 或 log。
            </div>
          ) : (
            noteBlocks.map((block) => (
              <BlockCard
                key={block.id}
                block={block}
                onCreateTask={onCreateTaskFromBlock}
                onPromoteToStream={onPromoteBlockToStream}
                onOpenSparkInStream={onOpenSparkInStream}
              />
            ))
          )}
        </div>
      </Card>

      <Card title="Timeline">
        <div className="space-y-2">
          {timelineItems.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              还没有历史事件。
            </div>
          ) : (
            timelineItems.map((item) => <HistoryEventCard key={item.id} item={item} />)
          )}
        </div>
      </Card>
    </div>
  );
}
