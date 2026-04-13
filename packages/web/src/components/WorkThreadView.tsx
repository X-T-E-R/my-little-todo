import type {
  WorkThreadInterruptSource,
  WorkThreadSuggestion,
  WorkThreadWaitingCondition,
} from '@my-little-todo/core';
import { ArrowLeft, ExternalLink, Loader2, Pin, PinOff, Plus, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModuleStore } from '../modules';
import { useRoleStore, useWorkThreadStore } from '../stores';
import type { ThinkSessionEditorHandle } from './ThinkSessionEditor';
import { ThinkSessionEditor } from './ThinkSessionEditor';
import { WorkThreadBoard } from './work-thread/WorkThreadBoard';
import { WorkThreadResumeCard } from './work-thread/WorkThreadResumeCard';

const WAITING_KIND_OPTIONS: WorkThreadWaitingCondition['kind'][] = [
  'person',
  'tool',
  'file',
  'time',
  'external',
];

const INTERRUPT_SOURCE_OPTIONS: WorkThreadInterruptSource[] = [
  'manual',
  'stream',
  'task',
  'system',
];

function formatStamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

function summarize(text: string | undefined, max = 140): string {
  const compact = text?.replace(/\s+/g, ' ').trim() ?? '';
  if (!compact) return '';
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function Section({
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
      <h4 className="mb-3 text-[12px] font-semibold" style={{ color: 'var(--color-text)' }}>
        {title}
      </h4>
      {children}
    </section>
  );
}

export function WorkThreadView({ onGoNow }: { onGoNow: () => void }) {
  const { t } = useTranslation('think');
  const editorRef = useRef<ThinkSessionEditorHandle>(null);
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const roles = useRoleStore((s) => s.roles);
  const roleNames = useMemo(() => Object.fromEntries(roles.map((role) => [role.id, role.name])), [roles]);
  const aiAgentEnabled = useModuleStore((s) => s.isEnabled('ai-agent'));

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
  const dispatchThread = useWorkThreadStore((s) => s.dispatchThread);
  const deleteThread = useWorkThreadStore((s) => s.deleteThread);
  const renameThread = useWorkThreadStore((s) => s.renameThread);
  const updateMission = useWorkThreadStore((s) => s.updateMission);
  const setStatus = useWorkThreadStore((s) => s.setStatus);
  const updateResumeCard = useWorkThreadStore((s) => s.updateResumeCard);
  const toggleWorkingSetItem = useWorkThreadStore((s) => s.toggleWorkingSetItem);
  const addWaitingCondition = useWorkThreadStore((s) => s.addWaitingCondition);
  const toggleWaitingSatisfied = useWorkThreadStore((s) => s.toggleWaitingSatisfied);
  const captureInterrupt = useWorkThreadStore((s) => s.captureInterrupt);
  const resolveInterrupt = useWorkThreadStore((s) => s.resolveInterrupt);
  const updateDoc = useWorkThreadStore((s) => s.updateDoc);
  const flushSave = useWorkThreadStore((s) => s.flushSave);
  const saveCheckpoint = useWorkThreadStore((s) => s.saveCheckpoint);
  const addManualContext = useWorkThreadStore((s) => s.addManualContext);
  const addLinkContext = useWorkThreadStore((s) => s.addLinkContext);
  const addNextAction = useWorkThreadStore((s) => s.addNextAction);
  const toggleNextActionDone = useWorkThreadStore((s) => s.toggleNextActionDone);
  const createTaskFromNextAction = useWorkThreadStore((s) => s.createTaskFromNextAction);
  const runAiSuggestion = useWorkThreadStore((s) => s.runAiSuggestion);
  const applySuggestionToDoc = useWorkThreadStore((s) => s.applySuggestionToDoc);
  const applySuggestionToNextActions = useWorkThreadStore((s) => s.applySuggestionToNextActions);

  const [draftTitle, setDraftTitle] = useState('');
  const [draftMission, setDraftMission] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [draftNextStep, setDraftNextStep] = useState('');
  const [draftWaitingSummary, setDraftWaitingSummary] = useState('');
  const [draftGuardrails, setDraftGuardrails] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [waitingTitle, setWaitingTitle] = useState('');
  const [waitingDetail, setWaitingDetail] = useState('');
  const [waitingKind, setWaitingKind] = useState<WorkThreadWaitingCondition['kind']>('external');
  const [interruptTitle, setInterruptTitle] = useState('');
  const [interruptDetail, setInterruptDetail] = useState('');
  const [interruptSource, setInterruptSource] = useState<WorkThreadInterruptSource>('manual');
  const [nextActionText, setNextActionText] = useState('');

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!currentThread) return;
    setDraftTitle(currentThread.title);
    setDraftMission(currentThread.mission);
    setDraftSummary(currentThread.resumeCard.summary);
    setDraftNextStep(currentThread.resumeCard.nextStep);
    setDraftWaitingSummary(currentThread.resumeCard.waitingSummary ?? '');
    setDraftGuardrails(currentThread.resumeCard.guardrails.join('\n'));
  }, [currentThread]);

  useEffect(() => {
    return () => {
      void flushSave();
    };
  }, [flushSave]);

  const pinnedSet = useMemo(
    () => new Set(currentThread?.workingSet.map((item) => item.contextItemId) ?? []),
    [currentThread],
  );

  const handleSaveResume = async () => {
    await updateResumeCard({
      summary: draftSummary.trim(),
      nextStep: draftNextStep.trim(),
      waitingSummary: draftWaitingSummary.trim() || undefined,
      guardrails: draftGuardrails
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      updatedAt: Date.now(),
    });
  };

  const handleApplySuggestionToDoc = async (suggestion: WorkThreadSuggestion) => {
    await applySuggestionToDoc(suggestion.id);
    editorRef.current?.insertText(`\n\n${suggestion.content}\n`);
  };

  if (!currentThread) {
    return (
      <WorkThreadBoard
        threads={threads}
        loading={loading}
        roleNames={roleNames}
        onCreate={() => void createThread({ roleId: currentRoleId ?? undefined })}
        onOpen={(id) => void openThread(id)}
        onResume={(id) => void dispatchThread(id, 'manual')}
        onDelete={(id) => void deleteThread(id)}
      />
    );
  }

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
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', background: 'var(--color-surface)' }}
        />
        <button
          type="button"
          onClick={onGoNow}
          className="rounded-xl border px-3 py-2 text-[11px] font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {t('toolbar_go_now')}
        </button>
      </header>

      {saveError ? (
        <p className="mb-2 text-[11px]" style={{ color: 'var(--color-danger, #c00)' }}>
          {saveError}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          <WorkThreadResumeCard
            thread={currentThread}
            onResume={() => void dispatchThread(currentThread.id, 'manual')}
            onCheckpoint={() => void saveCheckpoint()}
            onStatusChange={(status) => void setStatus(status)}
          />

          <Section title={t('thread_mission_title')}>
            <textarea
              value={draftMission}
              onChange={(event) => setDraftMission(event.target.value)}
              onBlur={() => void updateMission(draftMission)}
              rows={3}
              className="mb-3 w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('thread_resume_summary_label')}
                </div>
                <textarea
                  value={draftSummary}
                  onChange={(event) => setDraftSummary(event.target.value)}
                  rows={4}
                  className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
              <div className="space-y-2">
                <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('thread_resume_next_step_label')}
                </div>
                <input
                  value={draftNextStep}
                  onChange={(event) => setDraftNextStep(event.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
                <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('thread_waiting_summary_label')}
                </div>
                <input
                  value={draftWaitingSummary}
                  onChange={(event) => setDraftWaitingSummary(event.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
            </div>
            <textarea
              value={draftGuardrails}
              onChange={(event) => setDraftGuardrails(event.target.value)}
              rows={3}
              placeholder={t('thread_guardrails_label')}
              className="mt-3 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <button
              type="button"
              onClick={() => void handleSaveResume()}
              className="mt-3 rounded-xl px-3 py-2 text-xs font-medium text-white"
              style={{ background: 'var(--color-accent)' }}
            >
              {t('thread_resume_save')}
            </button>
          </Section>

          <section
            className="min-h-[420px] rounded-[28px] border p-3 sm:p-4"
            style={{ borderColor: 'var(--color-border)', background: 'color-mix(in srgb, var(--color-surface) 96%, var(--color-bg))' }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {t('thread_workspace_title')}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {formatStamp(currentThread.updatedAt)}
              </div>
            </div>
            <ThinkSessionEditor
              ref={editorRef}
              sessionId={`work-thread-${currentThread.id}`}
              initialMarkdown={currentThread.docMarkdown}
              onMarkdownChange={updateDoc}
            />
          </section>
        </div>

        <aside className="min-h-0 space-y-3 overflow-y-auto pr-1">
          <Section title={t('thread_working_set_title')}>
            <div className="space-y-2">
              {currentThread.workingSet.length === 0 ? (
                <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('thread_working_set_empty')}
                </div>
              ) : (
                currentThread.workingSet.map((item) => (
                  <div key={item.id} className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
                    <div className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>{item.title}</div>
                    {item.summary ? <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{summarize(item.summary)}</div> : null}
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section title={t('thread_context_title')}>
            <div className="space-y-2">
              {currentThread.contextItems.map((item) => (
                <div key={item.id} className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>{item.title}</div>
                      <div className="mt-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{item.kind}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleWorkingSetItem(item.id)}
                      className="rounded-full p-1"
                      style={{ color: pinnedSet.has(item.id) ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
                    >
                      {pinnedSet.has(item.id) ? <PinOff size={12} /> : <Pin size={12} />}
                    </button>
                  </div>
                  {item.content ? <div className="mt-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{summarize(item.content)}</div> : null}
                </div>
              ))}
            </div>

            <input
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
              placeholder={t('thread_manual_title')}
              className="mt-3 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <textarea
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder={t('thread_manual_body')}
              rows={3}
              className="mt-2 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <button
              type="button"
              onClick={() => {
                void addManualContext(noteTitle, noteBody);
                setNoteTitle('');
                setNoteBody('');
              }}
              className="mt-2 rounded-xl px-3 py-2 text-xs font-medium text-white"
              style={{ background: 'var(--color-accent)' }}
            >
              {t('thread_add_note')}
            </button>

            <input
              value={linkTitle}
              onChange={(event) => setLinkTitle(event.target.value)}
              placeholder={t('thread_link_title')}
              className="mt-3 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <input
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder={t('thread_link_url')}
              className="mt-2 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <button
              type="button"
              onClick={() => {
                void addLinkContext(linkTitle, linkUrl);
                setLinkTitle('');
                setLinkUrl('');
              }}
              className="mt-2 rounded-xl px-3 py-2 text-xs font-medium"
              style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
            >
              {t('thread_add_link')}
            </button>
          </Section>

          <Section title={t('thread_waiting_title')}>
            <input
              value={waitingTitle}
              onChange={(event) => setWaitingTitle(event.target.value)}
              placeholder={t('thread_waiting_input')}
              className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <select
              value={waitingKind}
              onChange={(event) => setWaitingKind(event.target.value as WorkThreadWaitingCondition['kind'])}
              className="mt-2 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {WAITING_KIND_OPTIONS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`thread_waiting_kind_${kind}`)}
                </option>
              ))}
            </select>
            <input
              value={waitingDetail}
              onChange={(event) => setWaitingDetail(event.target.value)}
              placeholder={t('thread_waiting_detail')}
              className="mt-2 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <button
              type="button"
              onClick={() => {
                void addWaitingCondition(waitingTitle, waitingKind, waitingDetail);
                setWaitingTitle('');
                setWaitingDetail('');
              }}
              className="mt-2 rounded-xl px-3 py-2 text-xs font-medium text-white"
              style={{ background: 'var(--color-accent)' }}
            >
              {t('thread_waiting_add')}
            </button>
            <div className="mt-3 space-y-2">
              {currentThread.waitingFor.length === 0 ? (
                <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('thread_waiting_empty')}
                </div>
              ) : (
                currentThread.waitingFor.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 rounded-xl border p-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                    <input type="checkbox" checked={item.satisfied} onChange={() => void toggleWaitingSatisfied(item.id)} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>{item.title}</span>
                      <span className="block text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{t(`thread_waiting_kind_${item.kind}`)}</span>
                      {item.detail ? <span className="mt-1 block text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{item.detail}</span> : null}
                    </span>
                  </label>
                ))
              )}
            </div>
          </Section>

          <Section title={t('thread_interrupts_title')}>
            <input
              value={interruptTitle}
              onChange={(event) => setInterruptTitle(event.target.value)}
              placeholder={t('thread_interrupt_input')}
              className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <select
              value={interruptSource}
              onChange={(event) =>
                setInterruptSource(event.target.value as WorkThreadInterruptSource)
              }
              className="mt-2 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {INTERRUPT_SOURCE_OPTIONS.map((source) => (
                <option key={source} value={source}>
                  {t(`thread_interrupt_source_${source}`)}
                </option>
              ))}
            </select>
            <textarea
              value={interruptDetail}
              onChange={(event) => setInterruptDetail(event.target.value)}
              placeholder={t('thread_interrupt_detail')}
              rows={3}
              className="mt-2 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <button
              type="button"
              onClick={() => {
                void captureInterrupt(interruptTitle, interruptDetail, interruptSource);
                setInterruptTitle('');
                setInterruptDetail('');
              }}
              className="mt-2 rounded-xl px-3 py-2 text-xs font-medium text-white"
              style={{ background: 'var(--color-accent)' }}
            >
              {t('thread_interrupt_add')}
            </button>
            <div className="mt-3 space-y-2">
              {currentThread.interrupts.length === 0 ? (
                <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('thread_interrupt_empty')}
                </div>
              ) : (
                currentThread.interrupts.map((interrupt) => (
                  <label
                    key={interrupt.id}
                    className="flex items-start gap-2 rounded-xl border p-3"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                  >
                    <input
                      type="checkbox"
                      checked={interrupt.resolved}
                      onChange={() => void resolveInterrupt(interrupt.id)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>
                        {interrupt.title}
                      </span>
                      <span className="block text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        {t(`thread_interrupt_source_${interrupt.source}`)}
                      </span>
                      {interrupt.content ? (
                        <span className="mt-1 block text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                          {interrupt.content}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))
              )}
            </div>
          </Section>

          <Section title={t('thread_next_actions_title')}>
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
                className="rounded-xl px-3 py-2 text-xs font-medium text-white"
                style={{ background: 'var(--color-accent)' }}
              >
                <Plus size={12} />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {currentThread.nextActions.length === 0 ? (
                <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('thread_next_actions_empty')}
                </div>
              ) : (
                currentThread.nextActions.map((action) => (
                  <div key={action.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" checked={action.done} onChange={() => void toggleNextActionDone(action.id)} className="mt-0.5" />
                      <span className="text-[12px]" style={{ color: 'var(--color-text)' }}>{action.text}</span>
                    </label>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
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
          </Section>

          {aiAgentEnabled ? (
            <Section title={t('thread_ai_title')}>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={aiBusy} onClick={() => void runAiSuggestion('organize_context')} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium" style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                  {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {t('thread_ai_organize')}
                </button>
                <button type="button" disabled={aiBusy} onClick={() => void runAiSuggestion('summarize_conclusion')} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium" style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                  <Sparkles size={12} />
                  {t('thread_ai_conclusion')}
                </button>
                <button type="button" disabled={aiBusy} onClick={() => void runAiSuggestion('extract_next_steps')} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium" style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                  <Sparkles size={12} />
                  {t('thread_ai_next_steps')}
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {(currentThread.suggestions ?? []).map((suggestion) => (
                  <div key={suggestion.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                    <div className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>{suggestion.title}</div>
                    <div className="mt-1 whitespace-pre-wrap text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{suggestion.content}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={suggestion.applied} onClick={() => void handleApplySuggestionToDoc(suggestion)} className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
                        {t('thread_apply_to_doc')}
                      </button>
                      <button type="button" disabled={suggestion.applied} onClick={() => void applySuggestionToNextActions(suggestion.id)} className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                        {t('thread_apply_to_actions')}
                      </button>
                    </div>
                  </div>
                ))}
                {(currentThread.suggestions ?? []).length === 0 ? (
                  <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t('thread_suggestions_empty')}
                  </div>
                ) : null}
              </div>
            </Section>
          ) : null}

          <Section title={t('thread_timeline_title')}>
            <div className="space-y-2">
              {currentEvents.slice(0, 12).map((event) => (
                <div key={event.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>{event.title}</span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{formatStamp(event.createdAt)}</span>
                  </div>
                  <div className="mt-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{event.actor}</div>
                  {event.detailMarkdown ? <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{event.detailMarkdown}</div> : null}
                </div>
              ))}
              {currentEvents.length === 0 ? (
                <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('thread_timeline_empty')}
                </div>
              ) : null}
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
