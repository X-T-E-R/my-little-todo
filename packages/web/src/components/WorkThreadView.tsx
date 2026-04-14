import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskStore, useRoleStore, useWorkThreadStore } from '../stores';
import { decideInitialThreadRoute } from '../utils/workThreadUiPrefs';
import type { ThinkSessionEditorHandle } from './ThinkSessionEditor';
import { ThinkSessionEditor } from './ThinkSessionEditor';
import { MaterialSidebar } from './think-session/MaterialSidebar';
import { WorkThreadBoard } from './work-thread/WorkThreadBoard';
import { WorkThreadEditorShell } from './work-thread/WorkThreadEditorShell';
import {
  type WorkThreadInlineCardKind,
  type WorkThreadInlineCardState,
  WorkThreadInlineCards,
} from './work-thread/WorkThreadInlineCards';
import {
  WORK_THREAD_SLASH_COMMANDS,
  WorkThreadInlineMenu,
} from './work-thread/WorkThreadInlineMenu';
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
  const captureInterrupt = useWorkThreadStore((s) => s.captureInterrupt);
  const resolveInterrupt = useWorkThreadStore((s) => s.resolveInterrupt);
  const updateDoc = useWorkThreadStore((s) => s.updateDoc);
  const flushSave = useWorkThreadStore((s) => s.flushSave);
  const saveCheckpoint = useWorkThreadStore((s) => s.saveCheckpoint);
  const addManualContext = useWorkThreadStore((s) => s.addManualContext);
  const addLinkContext = useWorkThreadStore((s) => s.addLinkContext);
  const addTaskToThread = useWorkThreadStore((s) => s.addTaskToThread);
  const addStreamToThread = useWorkThreadStore((s) => s.addStreamToThread);
  const addNextAction = useWorkThreadStore((s) => s.addNextAction);
  const toggleNextActionDone = useWorkThreadStore((s) => s.toggleNextActionDone);
  const createTaskFromNextAction = useWorkThreadStore((s) => s.createTaskFromNextAction);
  const syncStatus = useWorkThreadStore((s) => s.syncStatus);
  const syncMessage = useWorkThreadStore((s) => s.syncMessage);
  const pendingExternalThread = useWorkThreadStore((s) => s.pendingExternalThread);

  const [activeCard, setActiveCard] = useState<WorkThreadInlineCardState | null>(null);

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
      {pendingExternalThread ? (
        <div
          className="mx-3 mt-2 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-[12px]"
          style={{
            borderColor: 'var(--color-warning, #d97706)',
            background: 'color-mix(in srgb, var(--color-warning-soft, #fef3c7) 68%, var(--color-surface))',
            color: 'var(--color-text)',
          }}
        >
          <div className="min-w-0 flex-1">
            {syncMessage ?? t('thread_sync_external_change')}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void dismissPendingExternal()}
              className="rounded-xl border px-3 py-2 text-[11px] font-medium"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
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

      <WorkThreadEditorShell
        title={currentThread.title}
        onBackToBoard={() => void showThreadList()}
        onGoNow={onGoNow}
        materialSidebarOpen={materialSidebarOpen}
        runtimeSidebarOpen={runtimeSidebarOpen}
        onToggleMaterialSidebar={() => void setMaterialSidebarOpen(!materialSidebarOpen)}
        onToggleRuntimeSidebar={() => void setRuntimeSidebarOpen(!runtimeSidebarOpen)}
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
          <div className="space-y-3">
            <WorkThreadInlineMenu
              onOpenCommand={(commandId) =>
                setActiveCard({
                  kind: commandId as WorkThreadInlineCardKind,
                  anchor: { left: 24, top: 24 },
                })
              }
            />
            <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {syncStatus === 'synced'
                ? syncMessage ?? t('thread_sync_synced')
                : syncStatus === 'syncing'
                  ? t('thread_sync_pending_save')
                  : syncStatus === 'disabled'
                    ? t('thread_sync_disabled')
                    : syncMessage}
            </div>
          </div>
        }
        centerBody={
          <div className="relative flex h-full min-h-0 flex-col">
            <ThinkSessionEditor
              ref={editorRef}
              sessionId={`work-thread-${currentThread.id}`}
              initialMarkdown={currentThread.docMarkdown}
              onMarkdownChange={updateDoc}
              slashCommands={WORK_THREAD_SLASH_COMMANDS}
              onSlashCommand={(payload) =>
                setActiveCard({
                  kind: payload.command.id as WorkThreadInlineCardKind,
                  anchor: payload.anchor,
                })
              }
            />
            <WorkThreadInlineCards
              activeCard={activeCard}
              onClose={() => setActiveCard(null)}
              onAddNextAction={addNextAction}
              onAddWaiting={useWorkThreadStore.getState().addWaitingCondition}
              onCaptureInterrupt={captureInterrupt}
              onAddNoteContext={addManualContext}
              onAddLinkContext={addLinkContext}
              onSaveCheckpoint={() => saveCheckpoint()}
              onInsertMarkdown={(markdown) => editorRef.current?.insertText(markdown)}
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
