import type { StreamEntry, WorkThread, WorkThreadBlockView, WorkThreadSparkContainer } from '@my-little-todo/core';
import { buildWorkThreadBlockViews } from '@my-little-todo/core';
import { ChevronDown, ChevronRight, CirclePlus, ExternalLink, ListTodo, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkThreadStore } from '../../stores';
import {
  getWorkThreadFocusLabel,
  getWorkThreadFocusParent,
  normalizeWorkThreadFocus,
  type WorkThreadWorkspaceFocus,
} from '../../utils/workThreadFocus';

interface WorkThreadWorkspaceProps {
  thread: WorkThread;
  relatedSparks: StreamEntry[];
  onUpdateRootMarkdown: (markdown: string) => Promise<void>;
  onUpdateExplorationMarkdown: (markdown: string) => Promise<void>;
  onAddIntent: (text: string, options?: { bodyMarkdown?: string; parentIntentId?: string; parentSparkId?: string }) => Promise<{ id: string } | null>;
  onUpdateIntent: (id: string, patch: { text?: string; bodyMarkdown?: string; collapsed?: boolean; state?: WorkThread['intents'][number]['state'] }) => Promise<void>;
  onAddSpark: (title: string, options?: { bodyMarkdown?: string; parentIntentId?: string; parentSparkId?: string }) => Promise<WorkThreadSparkContainer | null>;
  onUpdateSpark: (id: string, patch: { title?: string; bodyMarkdown?: string; collapsed?: boolean }) => Promise<void>;
  onAddNext: (text: string, options?: { parentIntentId?: string; parentSparkId?: string }) => Promise<{ id: string } | null>;
  onUpdateNext: (id: string, patch: { text?: string; done?: boolean }) => Promise<void>;
  onToggleNext: (id: string) => Promise<void>;
  onCreateTaskFromNext: (id: string) => Promise<void>;
  onAddBlock: (title: string, options?: { detail?: string; parentIntentId?: string; parentSparkId?: string }) => Promise<{ id: string } | null>;
  onUpdateBlock: (id: string, patch: { title?: string; detail?: string }) => Promise<void>;
  onToggleBlock: (block: WorkThreadBlockView) => Promise<void>;
  onOpenSparkInStream: (entryId: string) => void;
  onCreateThreadFromSpark: (entryId: string) => Promise<void>;
  onCreateTaskFromSpark: (entryId: string) => Promise<void>;
  onArchiveSpark: (entryId: string) => Promise<void>;
  onCreateThreadFromIntent: (id: string) => Promise<void>;
  onCaptureIntentAsSpark: (id: string) => Promise<void>;
  onPromoteIntent: (id: string) => Promise<void>;
}

function SectionCard({
  title,
  subtitle,
  active,
  children,
  action,
  onActivate,
}: {
  title: string;
  subtitle?: string;
  active?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
  onActivate?: () => void;
}) {
  return (
    <section
      className="rounded-3xl border p-4 shadow-sm"
      style={{
        borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
        background: active
          ? 'color-mix(in srgb, var(--color-accent-soft) 40%, var(--color-surface))'
          : 'var(--color-surface)',
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <button type="button" onClick={onActivate} className="min-w-0 text-left">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-tertiary)' }}>
            {title}
          </div>
          {subtitle ? (
            <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
              {subtitle}
            </div>
          ) : null}
        </button>
        {action}
      </div>
      {children}
    </section>
  );
}

function useSyncedState(value: string) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return [draft, setDraft] as const;
}

function EditableMarkdownArea({
  value,
  placeholder,
  minRows = 4,
  autoFocus = false,
  onFocus,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  minRows?: number;
  autoFocus?: boolean;
  onFocus?: () => void;
  onCommit: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useSyncedState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
      ref.current?.setSelectionRange(draft.length, draft.length);
    }
  }, [autoFocus, draft.length]);

  return (
    <textarea
      ref={ref}
      value={draft}
      onFocus={onFocus}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void onCommit(draft)}
      placeholder={placeholder}
      rows={minRows}
      className="w-full resize-y rounded-2xl border px-3 py-3 text-sm leading-6 outline-none"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
      }}
    />
  );
}

function InlineTextInput({
  value,
  placeholder,
  autoFocus = false,
  onFocus,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
  onCommit: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useSyncedState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
      ref.current?.setSelectionRange(draft.length, draft.length);
    }
  }, [autoFocus, draft.length]);

  return (
    <input
      ref={ref}
      value={draft}
      onFocus={onFocus}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void onCommit(draft)}
      placeholder={placeholder}
      className="w-full rounded-2xl border px-3 py-2 text-sm outline-none"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
      }}
    />
  );
}

function NextItems({
  items,
  autoFocusId,
  onActivate,
  onUpdate,
  onToggle,
  onCreateTask,
}: {
  items: WorkThread['nextActions'];
  autoFocusId?: string | null;
  onActivate: () => void;
  onUpdate: (id: string, patch: { text?: string; done?: boolean }) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  onCreateTask: (id: string) => Promise<void>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border px-3 py-2"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
        >
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => void onToggle(item.id)} className="mt-1 shrink-0">
              <ListTodo size={14} style={{ color: item.done ? 'var(--color-success, #16a34a)' : 'var(--color-text-tertiary)' }} />
            </button>
            <div className="min-w-0 flex-1">
              <InlineTextInput
                value={item.text}
                autoFocus={autoFocusId === item.id}
                placeholder="新的下一步"
                onFocus={onActivate}
                onCommit={(value) => onUpdate(item.id, { text: value })}
              />
              {!item.linkedTaskId ? (
                <button
                  type="button"
                  onClick={() => void onCreateTask(item.id)}
                  className="mt-2 text-[11px] font-medium"
                  style={{ color: 'var(--color-accent)' }}
                >
                  创建任务
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BlockItems({
  items,
  autoFocusId,
  onActivate,
  onUpdate,
  onToggle,
}: {
  items: WorkThreadBlockView[];
  autoFocusId?: string | null;
  onActivate: () => void;
  onUpdate: (id: string, patch: { title?: string; detail?: string }) => Promise<void>;
  onToggle: (block: WorkThreadBlockView) => Promise<void>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((block) => (
        <div
          key={`${block.sourceKind}-${block.id}`}
          className="rounded-2xl border px-3 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {block.sourceKind === 'interrupt' ? '被打断' : '卡点'}
            </div>
            <button
              type="button"
              onClick={() => void onToggle(block)}
              className="text-[11px]"
              style={{ color: 'var(--color-accent)' }}
            >
              {block.state === 'cleared' ? '重新打开' : '标记解除'}
            </button>
          </div>
          <div className="mt-2">
            <InlineTextInput
              value={block.title}
              autoFocus={autoFocusId === block.id}
              placeholder="新的卡点"
              onFocus={onActivate}
              onCommit={(value) => onUpdate(block.id, { title: value })}
            />
          </div>
          <div className="mt-2">
            <EditableMarkdownArea
              value={block.detail ?? ''}
              minRows={2}
              placeholder="补充这个卡点的说明"
              onFocus={onActivate}
              onCommit={(value) => onUpdate(block.id, { detail: value })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ContainerCardProps {
  thread: WorkThread;
  sparkEntryMap: Map<string, StreamEntry>;
  blocks: WorkThreadBlockView[];
  focus: WorkThreadWorkspaceFocus;
  autoFocusId: string | null;
  onSetFocus: (focus: WorkThreadWorkspaceFocus) => void;
  onUpdateIntent: WorkThreadWorkspaceProps['onUpdateIntent'];
  onUpdateSpark: WorkThreadWorkspaceProps['onUpdateSpark'];
  onAddSpark: WorkThreadWorkspaceProps['onAddSpark'];
  onAddNext: WorkThreadWorkspaceProps['onAddNext'];
  onUpdateNext: WorkThreadWorkspaceProps['onUpdateNext'];
  onToggleNext: WorkThreadWorkspaceProps['onToggleNext'];
  onCreateTaskFromNext: WorkThreadWorkspaceProps['onCreateTaskFromNext'];
  onAddBlock: WorkThreadWorkspaceProps['onAddBlock'];
  onUpdateBlock: WorkThreadWorkspaceProps['onUpdateBlock'];
  onToggleBlock: WorkThreadWorkspaceProps['onToggleBlock'];
  onOpenSparkInStream: WorkThreadWorkspaceProps['onOpenSparkInStream'];
  onCreateThreadFromSpark: WorkThreadWorkspaceProps['onCreateThreadFromSpark'];
  onCreateTaskFromSpark: WorkThreadWorkspaceProps['onCreateTaskFromSpark'];
  onArchiveSpark: WorkThreadWorkspaceProps['onArchiveSpark'];
  onCreateThreadFromIntent: WorkThreadWorkspaceProps['onCreateThreadFromIntent'];
  onCaptureIntentAsSpark: WorkThreadWorkspaceProps['onCaptureIntentAsSpark'];
  onPromoteIntent: WorkThreadWorkspaceProps['onPromoteIntent'];
}

function SparkCard(props: ContainerCardProps & { spark: WorkThreadSparkContainer; level: number }) {
  const {
    spark,
    thread,
    sparkEntryMap,
    blocks,
    focus,
    autoFocusId,
    onSetFocus,
    onUpdateSpark,
    onAddSpark,
    onAddNext,
    onUpdateNext,
    onToggleNext,
    onCreateTaskFromNext,
    onAddBlock,
    onUpdateBlock,
    onToggleBlock,
    onOpenSparkInStream,
    onCreateThreadFromSpark,
    onCreateTaskFromSpark,
    onArchiveSpark,
  } = props;
  const active = focus.kind === 'spark' && focus.id === spark.id;
  const nextItems = thread.nextActions.filter((item) => item.parentSparkId === spark.id);
  const sparkBlocks = blocks.filter((block) => block.id && (thread.waitingFor.some((item) => item.id === block.id && item.parentSparkId === spark.id) || thread.interrupts.some((item) => item.id === block.id && item.parentSparkId === spark.id)));
  const childSparks = thread.sparkContainers.filter((item) => item.parentSparkId === spark.id);
  const entry = spark.streamEntryId ? sparkEntryMap.get(spark.streamEntryId) : undefined;

  return (
    <div className="space-y-3" style={{ marginLeft: props.level ? `${props.level * 12}px` : undefined }}>
      <SectionCard
        title="Spark"
        subtitle={entry ? '已同步到 Stream' : '线程内 spark'}
        active={active}
        onActivate={() => onSetFocus({ kind: 'spark', id: spark.id })}
        action={
          <button
            type="button"
            onClick={() => void onUpdateSpark(spark.id, { collapsed: !spark.collapsed })}
            className="rounded-full border p-1"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {spark.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        }
      >
        <InlineTextInput
          value={spark.title}
          autoFocus={autoFocusId === spark.id}
          placeholder="新 spark"
          onFocus={() => onSetFocus({ kind: 'spark', id: spark.id })}
          onCommit={(value) => onUpdateSpark(spark.id, { title: value })}
        />
        {!spark.collapsed ? (
          <>
            <div className="mt-3">
              <EditableMarkdownArea
                value={spark.bodyMarkdown}
                minRows={4}
                placeholder="在这个 spark 里面展开记录"
                onFocus={() => onSetFocus({ kind: 'spark', id: spark.id })}
                onCommit={(value) => onUpdateSpark(spark.id, { bodyMarkdown: value })}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void onAddNext('新的下一步', { parentSparkId: spark.id })} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                + 下一步
              </button>
              <button type="button" onClick={() => void onAddBlock('新的卡点', { parentSparkId: spark.id })} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                + 卡点
              </button>
              <button type="button" onClick={() => void onAddSpark('新 spark', { parentSparkId: spark.id })} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                + 子 spark
              </button>
              {entry ? (
                <>
                  <button type="button" onClick={() => onOpenSparkInStream(entry.id)} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}>
                    <ExternalLink size={12} className="mr-1 inline" />
                    去 Stream
                  </button>
                  {!entry.threadMeta?.promotedThreadId ? (
                    <button type="button" onClick={() => void onCreateThreadFromSpark(entry.id)} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}>
                      新线程
                    </button>
                  ) : null}
                  {!entry.threadMeta?.linkedTaskId ? (
                    <button type="button" onClick={() => void onCreateTaskFromSpark(entry.id)} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}>
                      转任务
                    </button>
                  ) : null}
                  {entry.threadMeta?.sparkState !== 'archived' ? (
                    <button type="button" onClick={() => void onArchiveSpark(entry.id)} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                      归档
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="mt-3 space-y-3">
              <NextItems
                items={nextItems}
                autoFocusId={autoFocusId}
                onActivate={() => onSetFocus({ kind: 'spark', id: spark.id })}
                onUpdate={onUpdateNext}
                onToggle={onToggleNext}
                onCreateTask={onCreateTaskFromNext}
              />
              <BlockItems
                items={sparkBlocks}
                autoFocusId={autoFocusId}
                onActivate={() => onSetFocus({ kind: 'spark', id: spark.id })}
                onUpdate={onUpdateBlock}
                onToggle={onToggleBlock}
              />
          {childSparks.map((child) => (
            <SparkCard key={child.id} {...props} spark={child} level={props.level + 1} />
          ))}
            </div>
          </>
        ) : null}
      </SectionCard>
    </div>
  );
}

function IntentCard(props: ContainerCardProps & { intent: WorkThread['intents'][number] }) {
  const {
    intent,
    thread,
    blocks,
    focus,
    autoFocusId,
    onSetFocus,
    onUpdateIntent,
    onAddSpark,
    onAddNext,
    onUpdateNext,
    onToggleNext,
    onCreateTaskFromNext,
    onAddBlock,
    onUpdateBlock,
    onToggleBlock,
    onCreateThreadFromIntent,
    onCaptureIntentAsSpark,
    onPromoteIntent,
  } = props;
  const active = focus.kind === 'intent' && focus.id === intent.id;
  const nextItems = thread.nextActions.filter((item) => item.parentIntentId === intent.id);
  const intentBlocks = blocks.filter((block) => block.id && (thread.waitingFor.some((item) => item.id === block.id && item.parentIntentId === intent.id) || thread.interrupts.some((item) => item.id === block.id && item.parentIntentId === intent.id)));
  const childSparks = thread.sparkContainers.filter((item) => item.parentIntentId === intent.id);

  return (
    <SectionCard
      title="Intent"
      subtitle={intent.state === 'done' ? '已推进' : '当前方向'}
      active={active}
      onActivate={() => onSetFocus({ kind: 'intent', id: intent.id })}
      action={
        <button
          type="button"
          onClick={() => void onUpdateIntent(intent.id, { collapsed: !(intent.collapsed ?? false) })}
          className="rounded-full border p-1"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {intent.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
      }
    >
      <InlineTextInput
        value={intent.text}
        autoFocus={autoFocusId === intent.id}
        placeholder="新意图"
        onFocus={() => onSetFocus({ kind: 'intent', id: intent.id })}
        onCommit={(value) => onUpdateIntent(intent.id, { text: value })}
      />
      {!intent.collapsed ? (
        <>
          <div className="mt-3">
            <EditableMarkdownArea
              value={intent.bodyMarkdown ?? ''}
              minRows={4}
              placeholder="在这个 intent 里面维护推进记录"
              onFocus={() => onSetFocus({ kind: 'intent', id: intent.id })}
              onCommit={(value) => onUpdateIntent(intent.id, { bodyMarkdown: value })}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void onAddNext('新的下一步', { parentIntentId: intent.id })} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              + 下一步
            </button>
            <button type="button" onClick={() => void onAddBlock('新的卡点', { parentIntentId: intent.id })} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              + 卡点
            </button>
            <button type="button" onClick={() => void onAddSpark('新 spark', { parentIntentId: intent.id })} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              + spark
            </button>
            <button type="button" onClick={() => void onPromoteIntent(intent.id)} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}>
              转下一步
            </button>
            <button type="button" onClick={() => void onCaptureIntentAsSpark(intent.id)} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}>
              捕获为 spark
            </button>
            <button type="button" onClick={() => void onCreateThreadFromIntent(intent.id)} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}>
              新线程
            </button>
          </div>

          <div className="mt-3 space-y-3">
            <NextItems
              items={nextItems}
              autoFocusId={autoFocusId}
              onActivate={() => onSetFocus({ kind: 'intent', id: intent.id })}
              onUpdate={onUpdateNext}
              onToggle={onToggleNext}
              onCreateTask={onCreateTaskFromNext}
            />
            <BlockItems
              items={intentBlocks}
              autoFocusId={autoFocusId}
              onActivate={() => onSetFocus({ kind: 'intent', id: intent.id })}
              onUpdate={onUpdateBlock}
              onToggle={onToggleBlock}
            />
            {childSparks.map((spark) => (
              <SparkCard
                key={spark.id}
                {...props}
                spark={spark}
                level={1}
              />
            ))}
          </div>
        </>
      ) : null}
    </SectionCard>
  );
}

export function WorkThreadWorkspace(props: WorkThreadWorkspaceProps) {
  const { t } = useTranslation('think');
  const { thread, relatedSparks } = props;
  const storedFocus = useWorkThreadStore((s) => s.workspaceFocus);
  const autoFocusId = useWorkThreadStore((s) => s.workspaceAutoFocusId);
  const setWorkspaceFocus = useWorkThreadStore((s) => s.setWorkspaceFocus);
  const requestWorkspaceAutoFocus = useWorkThreadStore((s) => s.requestWorkspaceAutoFocus);
  const focus = normalizeWorkThreadFocus(thread, storedFocus);

  const blocks = useMemo(() => buildWorkThreadBlockViews(thread), [thread]);
  const rootNextActions = useMemo(
    () => thread.nextActions.filter((item) => !item.parentIntentId && !item.parentSparkId),
    [thread.nextActions],
  );
  const rootBlocks = useMemo(
    () =>
      blocks.filter(
        (block) =>
          thread.waitingFor.some((item) => item.id === block.id && !item.parentIntentId && !item.parentSparkId) ||
          thread.interrupts.some((item) => item.id === block.id && !item.parentIntentId && !item.parentSparkId),
      ),
    [blocks, thread.interrupts, thread.waitingFor],
  );
  const rootIntents = useMemo(
    () => thread.intents.filter((item) => !item.parentIntentId && !item.parentSparkId),
    [thread.intents],
  );
  const rootSparks = useMemo(
    () => thread.sparkContainers.filter((item) => !item.parentIntentId && !item.parentSparkId),
    [thread.sparkContainers],
  );
  const sparkEntryMap = useMemo(() => {
    const map = new Map<string, StreamEntry>();
    relatedSparks.forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [relatedSparks]);

  useEffect(() => {
    if (!autoFocusId) return;
    const timer = window.setTimeout(() => requestWorkspaceAutoFocus(null), 400);
    return () => window.clearTimeout(timer);
  }, [autoFocusId, requestWorkspaceAutoFocus]);

  useEffect(() => {
    if (
      storedFocus.kind !== focus.kind ||
      ('id' in storedFocus && 'id' in focus ? storedFocus.id !== focus.id : storedFocus.kind !== focus.kind)
    ) {
      setWorkspaceFocus(focus);
    }
  }, [focus, setWorkspaceFocus, storedFocus]);

  const focusLabel = getWorkThreadFocusLabel(thread, focus);
  const focusedParent = getWorkThreadFocusParent(focus);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-4 py-4">
      <SectionCard
        title={t('thread_workspace_title')}
        subtitle={`${t('thread_workspace_hint')} 当前落点：${focusLabel}`}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                const created = await props.onAddIntent(t('thread_intent_placeholder'), {});
                if (created) {
                  setWorkspaceFocus({ kind: 'intent', id: created.id });
                  requestWorkspaceAutoFocus(created.id);
                }
              }}
              className="rounded-full border px-3 py-1 text-[11px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
            >
              <CirclePlus size={12} className="mr-1 inline" />
              新意图
            </button>
            <button
              type="button"
              onClick={async () => {
                const created = await props.onAddSpark('新 spark', focusedParent);
                if (created) {
                  setWorkspaceFocus({ kind: 'spark', id: created.id });
                  requestWorkspaceAutoFocus(created.id);
                }
              }}
              className="rounded-full border px-3 py-1 text-[11px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
            >
              <Sparkles size={12} className="mr-1 inline" />
              新 spark
            </button>
            <button
              type="button"
              onClick={async () => {
                const created = await props.onAddNext('新的下一步', focusedParent);
                if (created) requestWorkspaceAutoFocus(created.id);
              }}
              className="rounded-full border px-3 py-1 text-[11px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              + 下一步
            </button>
            <button
              type="button"
              onClick={async () => {
                const created = await props.onAddBlock('新的卡点', focusedParent);
                if (created) requestWorkspaceAutoFocus(created.id);
              }}
              className="rounded-full border px-3 py-1 text-[11px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              + 卡点
            </button>
          </div>
        }
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-4">
            <SectionCard
              title="正文"
              subtitle="线程级主线说明"
              active={focus.kind === 'root'}
              onActivate={() => setWorkspaceFocus({ kind: 'root' })}
            >
              <EditableMarkdownArea
                value={thread.rootMarkdown}
                minRows={6}
                placeholder="这里写这条线程现在到底在做什么、为什么切到这里。"
                onFocus={() => setWorkspaceFocus({ kind: 'root' })}
                onCommit={props.onUpdateRootMarkdown}
              />
            </SectionCard>

            {rootIntents.map((intent) => (
              <IntentCard
                key={intent.id}
                {...props}
                thread={thread}
                sparkEntryMap={sparkEntryMap}
                blocks={blocks}
                focus={focus}
                autoFocusId={autoFocusId}
                onSetFocus={setWorkspaceFocus}
                intent={intent}
              />
            ))}

            {rootSparks.map((spark) => (
              <SparkCard
                key={spark.id}
                {...props}
                thread={thread}
                sparkEntryMap={sparkEntryMap}
                blocks={blocks}
                focus={focus}
                autoFocusId={autoFocusId}
                onSetFocus={setWorkspaceFocus}
                spark={spark}
                level={0}
              />
            ))}
          </div>

          <div className="space-y-4">
            <SectionCard
              title={t('thread_next_actions_title')}
              subtitle="线程根级的立刻动作"
            >
              <NextItems
                items={rootNextActions}
                autoFocusId={autoFocusId}
                onActivate={() => setWorkspaceFocus({ kind: 'root' })}
                onUpdate={props.onUpdateNext}
                onToggle={props.onToggleNext}
                onCreateTask={props.onCreateTaskFromNext}
              />
              {rootNextActions.length === 0 ? (
                <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('thread_next_actions_empty')}
                </div>
              ) : null}
            </SectionCard>

            <SectionCard title={t('thread_blockers_title')} subtitle="线程根级的卡点 / 挂起原因">
              <BlockItems
                items={rootBlocks}
                autoFocusId={autoFocusId}
                onActivate={() => setWorkspaceFocus({ kind: 'root' })}
                onUpdate={props.onUpdateBlock}
                onToggle={props.onToggleBlock}
              />
              {rootBlocks.length === 0 ? (
                <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('thread_blockers_empty')}
                </div>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Exploration"
              subtitle="资料堆、链接集合、调研过程"
              active={focus.kind === 'exploration'}
              onActivate={() => setWorkspaceFocus({ kind: 'exploration' })}
            >
              <EditableMarkdownArea
                value={thread.explorationMarkdown}
                minRows={12}
                placeholder="把资料、链接和探索过程集中放在这里。"
                onFocus={() => setWorkspaceFocus({ kind: 'exploration' })}
                onCommit={props.onUpdateExplorationMarkdown}
              />
            </SectionCard>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
