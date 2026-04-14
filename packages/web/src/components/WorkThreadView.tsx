import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskStore, useRoleStore, useWorkThreadStore } from '../stores';
import { normalizeLegacyWorkThreadBlocks } from '../utils/workThreadLegacyBlocks';
import { buildWorkThreadSlashInsertion } from '../utils/workThreadSlash';
import { decideInitialThreadRoute } from '../utils/workThreadUiPrefs';
import type { ThinkSessionEditorHandle } from './ThinkSessionEditor';
import { ThinkSessionEditor } from './ThinkSessionEditor';
import { MaterialSidebar } from './think-session/MaterialSidebar';
import { WorkThreadBoard } from './work-thread/WorkThreadBoard';
import { WorkThreadEditorShell } from './work-thread/WorkThreadEditorShell';
import { getWorkThreadSlashCommands } from './work-thread/WorkThreadInlineMenu';
import { WorkThreadRuntimeSidebar } from './work-thread/WorkThreadRuntimeSidebar';

export function WorkThreadView({ onGoNow }: { onGoNow: () => void }) {
  const { t } = useTranslation('think');
  const editorRef = useRef<ThinkSessionEditorHandle>(null);
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const roles = useRoleStore((s) => s.roles);
  const roleNames = useMemo(() => Object.fromEntries(roles.map((role) => [role.id, role.name])), [roles]);
  const selectTask = useTaskStore((s) => s.selectTask);

  const threads = useWorkThreadStore((s) => s.threads);
  const currentThread = useWorkThreadStore((s) => s.currentThread);
  const currentEvents = useWorkThreadStore((s) => s.currentEvents);
  const loading = useWorkThreadStore((s) => s.loading);
  const saveError = useWorkThreadStore((s) => s.saveError);
  const threadListOpen = useWorkThreadStore((s) => s.threadListOpen);
  const materialSidebarOpen = useWorkThreadStore((s) => s.materialSidebarOpen);
  const runtimeSidebarOpen = useWorkThreadStore((s) => s.runtimeSidebarOpen);
  const loadThreads = useWorkThreadStore((s) => s.loadThreads);
  const loadUiPrefs = useWorkThreadStore((s) => s.loadUiPrefs);
  const setThreadListOpen = useWorkThreadStore((s) => s.setThreadListOpen);
  const setMaterialSidebarOpen = useWorkThreadStore((s) => s.setMaterialSidebarOpen);
  const setRuntimeSidebarOpen = useWorkThreadStore((s) => s.setRuntimeSidebarOpen);
  const checkExternalSync = useWorkThreadStore((s) => s.checkExternalSync);
  const reloadFromPendingExternal = useWorkThreadStore((s) => s.reloadFromPendingExternal);
  const dismissPendingExternal = useWorkThreadStore((s) => s.dismissPendingExternal);
  const showThreadList = useWorkThreadStore((s) => s.showThreadList);
  const openThread = useWorkThreadStore((s) => s.openThread);
  const createThread = useWorkThreadStore((s) => s.createThread);
  const dispatchThread = useWorkThreadStore((s) => s.dispatchThread);
  const deleteThread = useWorkThreadStore((s) => s.deleteThread);
  const updateMission = useWorkThreadStore((s) => s.updateMission);
  const setStatus = useWorkThreadStore((s) => s.setStatus);
  const updateResumeCard = useWorkThreadStore((s) => s.updateResumeCard);
  const toggleWaitingSatisfied = useWorkThreadStore((s) => s.toggleWaitingSatisfied);
  const resolveInterrupt = useWorkThreadStore((s) => s.resolveInterrupt);
  const updateDoc = useWorkThreadStore((s) => s.updateDoc);
  const flushSave = useWorkThreadStore((s) => s.flushSave);
  const saveCheckpoint = useWorkThreadStore((s) => s.saveCheckpoint);
  const addTaskToThread = useWorkThreadStore((s) => s.addTaskToThread);
  const addStreamToThread = useWorkThreadStore((s) => s.addStreamToThread);
  const toggleNextActionDone = useWorkThreadStore((s) => s.toggleNextActionDone);
  const createTaskFromNextAction = useWorkThreadStore((s) => s.createTaskFromNextAction);
  const syncStatus = useWorkThreadStore((s) => s.syncStatus);
  const syncMessage = useWorkThreadStore((s) => s.syncMessage);
  const pendingExternalThread = useWorkThreadStore((s) => s.pendingExternalThread);
  const slashCommands = useMemo(() => getWorkThreadSlashCommands(t), [t]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.all([loadThreads(), loadUiPrefs()]);
      if (cancelled) return;
      const state = useWorkThreadStore.getState();
      if (state.currentThread || state.threadListOpen) return;
      const route = decideInitialThreadRoute({
        currentThreadId: null,
        lastOpenedThreadId: state.lastOpenedThreadId,
        threadsCount: state.threads.length,
        openMode: state.threadOpenMode,
      });
      if (route.kind === 'thread') {
        await openThread(route.threadId);
        if (!useWorkThreadStore.getState().currentThread) {
          setThreadListOpen(true);
        }
        return;
      }
      setThreadListOpen(true);
    })();
    return () => {
      cancelled = true;
      void flushSave();
    };
  }, [flushSave, loadThreads, loadUiPrefs, openThread, setThreadListOpen]);

  useEffect(() => {
    const onFocus = () => {
      void checkExternalSync();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkExternalSync]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 1023.98px)');

    const syncCompactSidebarState = () => {
      const state = useWorkThreadStore.getState();
      if (!mediaQuery.matches) return;
      if (state.materialSidebarOpen && state.runtimeSidebarOpen) {
        void state.setMaterialSidebarOpen(false);
      }
    };

    syncCompactSidebarState();
    const handleChange = () => syncCompactSidebarState();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!currentThread) return;
    const normalized = normalizeLegacyWorkThreadBlocks(currentThread.docMarkdown, {
      waitingHeading: t('thread_waiting_title_short'),
      interruptHeading: t('thread_interrupt_title_short'),
    });
    if (normalized !== currentThread.docMarkdown) {
      updateDoc(normalized);
    }
  }, [currentThread, t, updateDoc]);

  if ((threadListOpen || !currentThread) && loading && threads.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('loading_session')}
        </p>
      </div>
    );
  }

  if (threadListOpen || !currentThread) {
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
    <div className="flex min-h-0 flex-1 flex-col">
      {saveError ? (
        <p className="px-3 pt-2 text-[11px]" style={{ color: 'var(--color-danger, #c00)' }}>
          {saveError}
        </p>
      ) : null}

      <WorkThreadEditorShell
        title={currentThread.title}
        onBackToBoard={() => void showThreadList()}
        onGoNow={onGoNow}
        materialSidebarOpen={materialSidebarOpen}
        runtimeSidebarOpen={runtimeSidebarOpen}
        onToggleMaterialSidebar={() => {
          const isCompact = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023.98px)').matches;
          if (isCompact && !materialSidebarOpen && runtimeSidebarOpen) {
            void setRuntimeSidebarOpen(false);
          }
          void setMaterialSidebarOpen(!materialSidebarOpen);
        }}
        onToggleRuntimeSidebar={() => {
          const isCompact = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023.98px)').matches;
          if (isCompact && !runtimeSidebarOpen && materialSidebarOpen) {
            void setMaterialSidebarOpen(false);
          }
          void setRuntimeSidebarOpen(!runtimeSidebarOpen);
        }}
        onDropMarkdown={(markdown) => editorRef.current?.insertText(`\n${markdown}`)}
        leftSidebar={
          <MaterialSidebar
            currentRoleId={currentRoleId}
            onInsertMarkdown={(markdown) => editorRef.current?.insertText(`\n${markdown}`)}
            onOpenTask={(taskId) => selectTask(taskId)}
            onCreateThreadFromTask={(task) => void addTaskToThread(task, 'new')}
            onAddTaskToWorkingSet={(task) => void addTaskToThread(task, 'current')}
            onAddStreamToThread={(entry) => void addStreamToThread(entry, 'current')}
          />
        }
        centerTop={
          <div className="border-b" style={{ borderColor: 'var(--color-border)' }}>
            {pendingExternalThread ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[12px]"
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  background:
                    'color-mix(in srgb, var(--color-warning-soft, #fef3c7) 72%, var(--color-surface))',
                  color: 'var(--color-text)',
                }}
              >
                <div className="min-w-0 flex-1">{t('thread_sync_external_change')}</div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void dismissPendingExternal()}
                    className="rounded-xl border px-3 py-2 text-[11px] font-medium"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {t('thread_sync_keep_current')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void reloadFromPendingExternal()}
                    className="rounded-xl px-3 py-2 text-[11px] font-semibold text-white"
                    style={{ background: 'var(--color-accent)' }}
                  >
                    {t('thread_sync_reload')}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {syncStatus === 'synced'
                  ? t('thread_sync_synced')
                  : syncStatus === 'syncing'
                    ? t('thread_sync_pending_save')
                    : syncStatus === 'disabled'
                      ? t('thread_sync_disabled')
                      : syncStatus === 'external-change'
                        ? t('thread_sync_external_change')
                        : syncMessage}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('thread_editor_inline_hint')}
              </div>
            </div>
          </div>
        }
        centerBody={
          <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
            <ThinkSessionEditor
              ref={editorRef}
              sessionId={`work-thread-${currentThread.id}`}
              initialMarkdown={currentThread.docMarkdown}
              onMarkdownChange={updateDoc}
              nativeSlashUi="off"
              editorClassName="work-thread-editor"
              slashCommands={slashCommands}
              onSlashCommand={(payload) => {
                const insertion = buildWorkThreadSlashInsertion(payload.command.id, {
                  checkpointLabel: new Date().toLocaleString(),
                  waitingHeading: t('thread_waiting_title_short'),
                  interruptHeading: t('thread_interrupt_title_short'),
                  waitingTitlePlaceholder: t('thread_inline_title_placeholder'),
                  waitingDetailPlaceholder: t('thread_inline_detail_placeholder'),
                  interruptTitlePlaceholder: t('thread_inline_title_placeholder'),
                  interruptDetailPlaceholder: t('thread_inline_detail_placeholder'),
                  noteTitlePlaceholder: t('thread_inline_title_placeholder'),
                  noteBodyPlaceholder: t('thread_inline_detail_placeholder'),
                  linkTitlePlaceholder: t('thread_inline_title_placeholder'),
                  linkUrlPlaceholder: t('thread_inline_link_placeholder'),
                  checkpointResumePlaceholder: t('thread_inline_title_placeholder'),
                  checkpointNextPlaceholder: t('thread_inline_detail_placeholder'),
                });
                if (!insertion) return;
                editorRef.current?.replaceMarkdownRange(
                  payload.replaceFrom,
                  payload.replaceTo,
                  insertion.markdown,
                  {
                    text: insertion.selectionText,
                    fallback: 'end',
                  },
                );
                if (insertion.shouldSaveCheckpoint) {
                  void saveCheckpoint();
                }
              }}
            />
          </div>
        }
        rightSidebar={
          <WorkThreadRuntimeSidebar
            thread={currentThread}
            events={currentEvents}
            onResume={() => void dispatchThread(currentThread.id, 'manual')}
            onCheckpoint={() => void saveCheckpoint()}
            onStatusChange={(status) => void setStatus(status)}
            onUpdateMission={(mission) => void updateMission(mission)}
            onUpdateResumeCard={(patch) => void updateResumeCard(patch)}
            onToggleWaiting={(id) => void toggleWaitingSatisfied(id)}
            onToggleNextAction={(id) => void toggleNextActionDone(id)}
            onCreateTaskFromNextAction={(id) => void createTaskFromNextAction(id)}
            onResolveInterrupt={(id) => void resolveInterrupt(id)}
          />
        }
      />
    </div>
  );
}
