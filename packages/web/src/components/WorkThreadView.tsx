import type { StreamEntry, Task, WorkThreadStatus } from '@my-little-todo/core';
import { displayTaskTitle } from '@my-little-todo/core';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  NotebookPen,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getRecentStreamCandidates,
  useRoleStore,
  useTaskStore,
  useWorkThreadStore,
} from '../stores';
import { formatTaskRefMarkdown } from '../utils/taskRefs';
import type { ThinkSessionEditorHandle } from './ThinkSessionEditor';
import { ThinkSessionEditor } from './ThinkSessionEditor';

const STATUS_OPTIONS: WorkThreadStatus[] = ['active', 'paused', 'done'];
const PANEL_OPTIONS = [
  { id: 'context', label: 'Context' },
  { id: 'ai', label: 'AI' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'actions', label: 'Actions' },
  { id: 'timeline', label: 'Timeline' },
] as const;
const CONTEXT_TOOLS = [
  { id: 'note', label: 'Add note' },
  { id: 'link', label: 'Add link' },
  { id: 'task', label: 'From task' },
  { id: 'stream', label: 'From stream' },
] as const;

type WorkThreadPanel = (typeof PANEL_OPTIONS)[number]['id'];
type ContextTool = (typeof CONTEXT_TOOLS)[number]['id'] | null;

function formatStamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

function summarizeStream(entry: StreamEntry): string {
  const compact = entry.content.replace(/\s+/g, ' ').trim();
  return compact.length > 72 ? `${compact.slice(0, 72)}...` : compact;
}

function PanelButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors"
      style={{
        background: active ? 'var(--color-accent-soft)' : 'transparent',
        color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
      }}
    >
      {label}
    </button>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border p-3"
      style={{
        borderColor: 'var(--color-border)',
        background: 'color-mix(in srgb, var(--color-bg) 72%, var(--color-surface))',
      }}
    >
      <div className="mb-3">
        <h4 className="text-[12px] font-semibold" style={{ color: 'var(--color-text)' }}>
          {title}
        </h4>
        {description ? (
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function WorkThreadView({ onGoNow }: { onGoNow: () => void }) {
  const { t } = useTranslation('think');
  const editorRef = useRef<ThinkSessionEditorHandle>(null);
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const roles = useRoleStore((s) => s.roles);
  const tasks = useTaskStore((s) => s.tasks);

  const threads = useWorkThreadStore((s) => s.threads);
  const currentThread = useWorkThreadStore((s) => s.currentThread);
  const currentEvents = useWorkThreadStore((s) => s.currentEvents);
  const loading = useWorkThreadStore((s) => s.loading);
  const aiBusy = useWorkThreadStore((s) => s.aiBusy);
  const saveError = useWorkThreadStore((s) => s.saveError);
  const loadThreads = useWorkThreadStore((s) => s.loadThreads);
  const showThreadList = useWorkThreadStore((s) => s.showThreadList);
  const openThread = useWorkThreadStore((s) => s.openThread);
  const createThread = useWorkThreadStore((s) => s.createThread);
  const deleteThread = useWorkThreadStore((s) => s.deleteThread);
  const renameThread = useWorkThreadStore((s) => s.renameThread);
  const setStatus = useWorkThreadStore((s) => s.setStatus);
  const updateDoc = useWorkThreadStore((s) => s.updateDoc);
  const flushSave = useWorkThreadStore((s) => s.flushSave);
  const saveCheckpoint = useWorkThreadStore((s) => s.saveCheckpoint);
  const addManualContext = useWorkThreadStore((s) => s.addManualContext);
  const addLinkContext = useWorkThreadStore((s) => s.addLinkContext);
  const addTaskToThread = useWorkThreadStore((s) => s.addTaskToThread);
  const addStreamToThread = useWorkThreadStore((s) => s.addStreamToThread);
  const addDecision = useWorkThreadStore((s) => s.addDecision);
  const addNextAction = useWorkThreadStore((s) => s.addNextAction);
  const toggleNextActionDone = useWorkThreadStore((s) => s.toggleNextActionDone);
  const createTaskFromNextAction = useWorkThreadStore((s) => s.createTaskFromNextAction);
  const runAiSuggestion = useWorkThreadStore((s) => s.runAiSuggestion);
  const applySuggestionToDoc = useWorkThreadStore((s) => s.applySuggestionToDoc);
  const applySuggestionToNextActions = useWorkThreadStore((s) => s.applySuggestionToNextActions);

  const [draftTitle, setDraftTitle] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [decisionTitle, setDecisionTitle] = useState('');
  const [decisionDetail, setDecisionDetail] = useState('');
  const [nextActionText, setNextActionText] = useState('');
  const [activePanel, setActivePanel] = useState<WorkThreadPanel>('context');
  const [contextTool, setContextTool] = useState<ContextTool>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!currentThread) return;
    setDraftTitle(currentThread.title);
  }, [currentThread]);

  useEffect(() => {
    return () => {
      void flushSave();
    };
  }, [flushSave]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [activePanel, currentThread?.id]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => task.status !== 'completed' && task.status !== 'archived')
      .filter((task) => !currentRoleId || task.roleId === currentRoleId)
      .slice(0, 12);
  }, [tasks, currentRoleId]);

  const recentStream = useMemo(() => {
    return getRecentStreamCandidates(10).filter(
      (entry: StreamEntry) => !currentRoleId || entry.roleId === currentRoleId,
    );
  }, [currentRoleId]);

  const decisionEvents = useMemo(
    () => currentEvents.filter((event) => event.type === 'decision_recorded'),
    [currentEvents],
  );

  const insertTaskRef = (task: Task) => {
    editorRef.current?.insertText(`\n${formatTaskRefMarkdown(task)}\n`);
  };

  const insertContextSnippet = (entry: StreamEntry) => {
    editorRef.current?.insertText(`\n> ${summarizeStream(entry)}\n`);
  };

  if (!currentThread) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t('thread_panel_title')}
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t('thread_panel_subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void createThread({ roleId: currentRoleId ?? undefined })}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white"
            style={{ background: 'var(--color-accent)' }}
          >
            <Plus size={14} />
            {t('thread_new')}
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
          </div>
        ) : threads.length === 0 ? (
          <div
            className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
          >
            <NotebookPen size={24} className="mb-3" />
            <p className="text-sm font-medium">{t('thread_empty_title')}</p>
            <p className="mt-1 text-xs">{t('thread_empty_hint')}</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {threads.map((thread) => {
              const roleName = thread.roleId ? roles.find((role) => role.id === thread.roleId)?.name : null;
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => void openThread(thread.id)}
                  className="rounded-2xl border p-4 text-left transition-colors hover:bg-[var(--color-surface)]"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
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
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteThread(thread.id);
                      }}
                      className="rounded-lg p-1"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      aria-label={t('delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div
                    className="mt-3 flex flex-wrap gap-2 text-[11px]"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <span>
                      {t('thread_status_label', { status: t(`thread_status_${thread.status}`) })}
                    </span>
                    <span>{t('thread_context_count', { count: thread.contextItems.length })}</span>
                    <span>{t('thread_actions_count', { count: thread.nextActions.length })}</span>
                  </div>
                  {roleName ? (
                    <div className="mt-2 text-[11px]" style={{ color: 'var(--color-accent)' }}>
                      {roleName}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const roleName = currentThread.roleId ? roles.find((role) => role.id === currentThread.roleId)?.name : null;

  const renderSidebarContent = () => {
    if (activePanel === 'context') {
      return (
        <div className="space-y-3">
          <SectionCard
            title={t('thread_context_title')}
            description="Keep only the supporting material here, and feed the main document when something is worth keeping."
          >
            <div className="space-y-2">
              {currentThread.contextItems.length === 0 ? (
                <div
                  className="rounded-xl border border-dashed px-3 py-4 text-[11px] text-center"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
                >
                  No context captured yet.
                </div>
              ) : (
                currentThread.contextItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border px-3 py-2.5"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                  >
                    <div className="font-medium text-[12px]" style={{ color: 'var(--color-text)' }}>
                      {item.title}
                    </div>
                    {item.content ? (
                      <div
                        className="mt-1 whitespace-pre-wrap text-[11px]"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {item.content}
                      </div>
                    ) : null}
                    <div className="mt-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      {item.kind}
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Add context"
            description="Choose one source at a time instead of keeping four forms permanently open."
          >
            <div className="flex flex-wrap gap-2">
              {CONTEXT_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setContextTool((current) => (current === tool.id ? null : tool.id))}
                  className="rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors"
                  style={{
                    background: contextTool === tool.id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                    color: contextTool === tool.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  }}
                >
                  {tool.label}
                </button>
              ))}
            </div>

            {contextTool === 'note' ? (
              <div className="mt-3 space-y-2">
                <input
                  value={manualTitle}
                  onChange={(event) => setManualTitle(event.target.value)}
                  placeholder={t('thread_manual_title')}
                  className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
                <textarea
                  value={manualContent}
                  onChange={(event) => setManualContent(event.target.value)}
                  placeholder={t('thread_manual_body')}
                  rows={4}
                  className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    void addManualContext(manualTitle, manualContent);
                    setManualTitle('');
                    setManualContent('');
                  }}
                  className="rounded-xl px-3 py-2 text-xs font-medium"
                  style={{ background: 'var(--color-accent)', color: 'white' }}
                >
                  {t('thread_add_note')}
                </button>
              </div>
            ) : null}

            {contextTool === 'link' ? (
              <div className="mt-3 space-y-2">
                <input
                  value={linkTitle}
                  onChange={(event) => setLinkTitle(event.target.value)}
                  placeholder={t('thread_link_title')}
                  className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
                <input
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  placeholder={t('thread_link_url')}
                  className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    void addLinkContext(linkTitle, linkUrl);
                    setLinkTitle('');
                    setLinkUrl('');
                  }}
                  className="rounded-xl px-3 py-2 text-xs font-medium"
                  style={{ background: 'var(--color-accent)', color: 'white' }}
                >
                  {t('thread_add_link')}
                </button>
              </div>
            ) : null}

            {contextTool === 'task' ? (
              <div className="mt-3 space-y-2">
                {filteredTasks.length === 0 ? (
                  <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    No task candidates right now.
                  </div>
                ) : (
                  filteredTasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-xl border px-3 py-2.5"
                      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                    >
                      <div className="line-clamp-2 text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>
                        {displayTaskTitle(task)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void addTaskToThread(task)}
                          className="rounded-full px-2.5 py-1 text-[11px]"
                          style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
                        >
                          {t('thread_add_context')}
                        </button>
                        <button
                          type="button"
                          onClick={() => insertTaskRef(task)}
                          className="rounded-full px-2.5 py-1 text-[11px]"
                          style={{
                            background: 'var(--color-accent-soft)',
                            color: 'var(--color-accent)',
                          }}
                        >
                          {t('thread_insert_ref')}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {contextTool === 'stream' ? (
              <div className="mt-3 space-y-2">
                {recentStream.length === 0 ? (
                  <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    No recent stream snippets.
                  </div>
                ) : (
                  recentStream.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border px-3 py-2.5"
                      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                    >
                      <div className="line-clamp-3 text-[11px]" style={{ color: 'var(--color-text)' }}>
                        {summarizeStream(entry)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void addStreamToThread(entry)}
                          className="rounded-full px-2.5 py-1 text-[11px]"
                          style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
                        >
                          {t('thread_add_context')}
                        </button>
                        <button
                          type="button"
                          onClick={() => insertContextSnippet(entry)}
                          className="rounded-full px-2.5 py-1 text-[11px]"
                          style={{
                            background: 'var(--color-accent-soft)',
                            color: 'var(--color-accent)',
                          }}
                        >
                          {t('thread_insert_quote')}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </SectionCard>
        </div>
      );
    }

    if (activePanel === 'ai') {
      return (
        <div className="space-y-3">
          <SectionCard title={t('thread_ai_title')} description="Use AI as a sidecar, not as the center of the page.">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={aiBusy}
                onClick={() => void runAiSuggestion('organize_context')}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
              >
                {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {t('thread_ai_organize')}
              </button>
              <button
                type="button"
                disabled={aiBusy}
                onClick={() => void runAiSuggestion('summarize_conclusion')}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
              >
                <Sparkles size={12} />
                {t('thread_ai_conclusion')}
              </button>
              <button
                type="button"
                disabled={aiBusy}
                onClick={() => void runAiSuggestion('extract_next_steps')}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
              >
                <Sparkles size={12} />
                {t('thread_ai_next_steps')}
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title={t('thread_suggestions_title')}
            description="Suggestions stay actionable, but they no longer fight with decisions and actions for the same visual slot."
          >
            <div className="space-y-2">
              {(currentThread.suggestions ?? []).length === 0 ? (
                <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  No AI suggestions yet.
                </div>
              ) : (
                (currentThread.suggestions ?? []).map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="rounded-xl border p-3"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                  >
                    <div className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>
                      {suggestion.title}
                    </div>
                    <div
                      className="mt-1 whitespace-pre-wrap text-[11px]"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {suggestion.content}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={suggestion.applied}
                        onClick={() => void applySuggestionToDoc(suggestion.id)}
                        className="rounded-full px-2.5 py-1 text-[11px]"
                        style={{
                          background: 'var(--color-accent-soft)',
                          color: 'var(--color-accent)',
                        }}
                      >
                        {t('thread_apply_to_doc')}
                      </button>
                      <button
                        type="button"
                        disabled={suggestion.applied}
                        onClick={() => void applySuggestionToNextActions(suggestion.id)}
                        className="rounded-full px-2.5 py-1 text-[11px]"
                        style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
                      >
                        {t('thread_apply_to_actions')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      );
    }

    if (activePanel === 'decisions') {
      return (
        <div className="space-y-3">
          <SectionCard title={t('thread_decision_title')} description="Record decisions here, then let the main document carry the reasoning.">
            <div className="space-y-2">
              <input
                value={decisionTitle}
                onChange={(event) => setDecisionTitle(event.target.value)}
                placeholder={t('thread_decision_input')}
                className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
              <textarea
                value={decisionDetail}
                onChange={(event) => setDecisionDetail(event.target.value)}
                placeholder={t('thread_decision_detail')}
                rows={4}
                className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
              <button
                type="button"
                onClick={() => {
                  void addDecision(decisionTitle, decisionDetail);
                  setDecisionTitle('');
                  setDecisionDetail('');
                }}
                className="rounded-xl px-3 py-2 text-xs font-medium"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                {t('thread_add_decision')}
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Recorded decisions">
            <div className="space-y-2">
              {decisionEvents.length === 0 ? (
                <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  No decisions recorded yet.
                </div>
              ) : (
                decisionEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl border p-3"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>
                        {event.title}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        {formatStamp(event.createdAt)}
                      </span>
                    </div>
                    {event.detailMarkdown ? (
                      <div
                        className="mt-1 whitespace-pre-wrap text-[11px]"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {event.detailMarkdown}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      );
    }

    if (activePanel === 'actions') {
      return (
        <div className="space-y-3">
          <SectionCard title={t('thread_next_actions_title')} description="Keep next steps as a compact queue you can check off or turn into tasks.">
            <div className="flex gap-2">
              <input
                value={nextActionText}
                onChange={(event) => setNextActionText(event.target.value)}
                placeholder={t('thread_next_action_input')}
                className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs outline-none"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
              <button
                type="button"
                onClick={() => {
                  void addNextAction(nextActionText);
                  setNextActionText('');
                }}
                className="rounded-xl px-3 py-2 text-xs font-medium"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                <Plus size={12} />
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Action queue">
            <div className="space-y-2">
              {currentThread.nextActions.length === 0 ? (
                <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  No next actions yet.
                </div>
              ) : (
                currentThread.nextActions.map((action) => (
                  <div
                    key={action.id}
                    className="rounded-xl border p-3"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                  >
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={action.done}
                        onChange={() => void toggleNextActionDone(action.id)}
                        className="mt-0.5"
                      />
                      <span className="text-[12px]" style={{ color: 'var(--color-text)' }}>
                        {action.text}
                      </span>
                    </label>
                    <div
                      className="mt-2 flex flex-wrap items-center gap-2 text-[10px]"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <span>{action.source}</span>
                      {action.linkedTaskId ? (
                        <span>{t('thread_task_created_linked')}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void createTaskFromNextAction(action.id)}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-1"
                          style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
                        >
                          <ExternalLink size={10} />
                          {t('thread_create_task')}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      );
    }

    return (
      <SectionCard
        title={t('thread_timeline_title')}
        description="The full trail stays available, but it no longer competes with the editor by default."
      >
        <div className="space-y-2">
          {currentEvents.length === 0 ? (
            <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              No timeline yet.
            </div>
          ) : (
            currentEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-xl border p-3"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>
                    {event.title}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {formatStamp(event.createdAt)}
                  </span>
                </div>
                <div className="mt-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {event.actor}
                </div>
                {event.detailMarkdown ? (
                  <div
                    className="mt-1 whitespace-pre-wrap text-[11px]"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {event.detailMarkdown}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </SectionCard>
    );
  };

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="rounded-[24px] border p-3"
        style={{
          borderColor: 'var(--color-border)',
          background: 'color-mix(in srgb, var(--color-surface) 96%, var(--color-bg))',
        }}
      >
        <div className="mb-3">
          <div className="text-[12px] font-semibold" style={{ color: 'var(--color-text)' }}>
            Thread sidecar
          </div>
          <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
            One secondary panel at a time, so the document stays primary.
          </div>
        </div>
        <div
          className="flex flex-wrap gap-1 rounded-2xl p-1"
          style={{ background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)' }}
        >
          {PANEL_OPTIONS.map((panel) => (
            <PanelButton
              key={panel.id}
              label={panel.label}
              active={activePanel === panel.id}
              onClick={() => setActivePanel(panel.id)}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">{renderSidebarContent()}</div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void showThreadList()}
          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <ArrowLeft size={14} />
          {t('thread_back')}
        </button>
        <input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={() => void renameThread(draftTitle)}
          className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm font-semibold outline-none"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
            background: 'var(--color-surface)',
          }}
        />
        <select
          value={currentThread.status}
          onChange={(event) => void setStatus(event.target.value as WorkThreadStatus)}
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
          onClick={() => void saveCheckpoint()}
          className="rounded-xl border px-3 py-2 text-[11px] font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {t('thread_checkpoint')}
        </button>
        <button
          type="button"
          onClick={onGoNow}
          className="rounded-xl border px-3 py-2 text-[11px] font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {t('toolbar_go_now')}
        </button>
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="rounded-xl border px-3 py-2 text-[11px] font-medium xl:hidden"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          Panels
        </button>
      </header>

      {saveError ? (
        <p className="mb-2 text-[11px]" style={{ color: 'var(--color-danger, #c00)' }}>
          {saveError}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-3">
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[28px] border p-3 sm:p-4"
          style={{
            borderColor: 'var(--color-border)',
            background: 'color-mix(in srgb, var(--color-surface) 96%, var(--color-bg))',
          }}
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--color-text-tertiary)' }}>
                Main document
              </div>
              <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {currentThread.title}
              </div>
              <div
                className="mt-2 flex flex-wrap gap-2 text-[11px]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <span className="rounded-full bg-[var(--color-bg)] px-2.5 py-1">
                  {t(`thread_status_${currentThread.status}`)}
                </span>
                {roleName ? (
                  <span className="rounded-full bg-[var(--color-bg)] px-2.5 py-1">{roleName}</span>
                ) : null}
                <span className="rounded-full bg-[var(--color-bg)] px-2.5 py-1">
                  {t('thread_context_count', { count: currentThread.contextItems.length })}
                </span>
                <span className="rounded-full bg-[var(--color-bg)] px-2.5 py-1">
                  {t('thread_actions_count', { count: currentThread.nextActions.length })}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-full bg-[var(--color-bg)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-secondary)] xl:hidden"
            >
              Open side panel
            </button>
          </div>

          <div className="min-h-0 flex-1">
            <ThinkSessionEditor
              ref={editorRef}
              sessionId={`work-thread-${currentThread.id}`}
              initialMarkdown={currentThread.docMarkdown}
              onMarkdownChange={updateDoc}
            />
          </div>
        </div>

        <aside className="hidden min-h-0 w-[340px] shrink-0 xl:block">{sidebar}</aside>
      </div>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-[90] xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/25"
            aria-label="Close side panel"
            onClick={() => setSidebarOpen(false)}
          />
          <div
            className="absolute inset-y-0 right-0 w-full max-w-[360px] p-3 shadow-2xl"
            style={{ background: 'var(--color-bg)' }}
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-full bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Close
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      ) : null}
    </div>
  );
}
