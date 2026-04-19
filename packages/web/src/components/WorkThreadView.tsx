import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useExecCoachStore, useRoleStore, useStreamStore, useTaskStore, useWorkThreadStore } from '../stores';
import { getWorkThreadFocusLabel } from '../utils/workThreadFocus';
import { decideInitialThreadRoute } from '../utils/workThreadUiPrefs';
import { MaterialSidebar } from './think-session/MaterialSidebar';
import { WorkThreadBoard } from './work-thread/WorkThreadBoard';
import { WorkThreadDocumentEditor } from './work-thread/WorkThreadDocumentEditor';
import { WorkThreadEditorShell } from './work-thread/WorkThreadEditorShell';
import { WorkThreadRuntimeSidebar } from './work-thread/WorkThreadRuntimeSidebar';

export function WorkThreadView({ onGoNow }: { onGoNow: () => void }) {
  const { t } = useTranslation('think');
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const roles = useRoleStore((s) => s.roles);
  const roleNames = useMemo(() => Object.fromEntries(roles.map((role) => [role.id, role.name])), [roles]);
  const selectTask = useTaskStore((s) => s.selectTask);
  const streamEntries = useStreamStore((s) => s.entries);

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
  const setStatus = useWorkThreadStore((s) => s.setStatus);
  const toggleWaitingSatisfied = useWorkThreadStore((s) => s.toggleWaitingSatisfied);
  const resolveInterrupt = useWorkThreadStore((s) => s.resolveInterrupt);
  const updateDoc = useWorkThreadStore((s) => s.updateDoc);
  const updateExplorationMarkdown = useWorkThreadStore((s) => s.updateExplorationMarkdown);
  const flushSave = useWorkThreadStore((s) => s.flushSave);
  const saveCheckpoint = useWorkThreadStore((s) => s.saveCheckpoint);
  const addTaskToThread = useWorkThreadStore((s) => s.addTaskToThread);
  const addStreamToThread = useWorkThreadStore((s) => s.addStreamToThread);
  const setIntentState = useWorkThreadStore((s) => s.setIntentState);
  const promoteIntentToNextAction = useWorkThreadStore((s) => s.promoteIntentToNextAction);
  const captureIntentAsSpark = useWorkThreadStore((s) => s.captureIntentAsSpark);
  const createThreadFromIntent = useWorkThreadStore((s) => s.createThreadFromIntent);
  const createThreadFromSpark = useWorkThreadStore((s) => s.createThreadFromSpark);
  const createTaskFromSpark = useWorkThreadStore((s) => s.createTaskFromSpark);
  const archiveSpark = useWorkThreadStore((s) => s.archiveSpark);
  const createTaskFromNextAction = useWorkThreadStore((s) => s.createTaskFromNextAction);
  const toggleNextActionDone = useWorkThreadStore((s) => s.toggleNextActionDone);
  const energyLevel = useExecCoachStore((s) => s.energyLevel);
  const workMode = useExecCoachStore((s) => s.workMode);
  const workStateNote = useExecCoachStore((s) => s.workStateNote);
  const syncStatus = useWorkThreadStore((s) => s.syncStatus);
  const syncMessage = useWorkThreadStore((s) => s.syncMessage);
  const pendingExternalThread = useWorkThreadStore((s) => s.pendingExternalThread);
  const workspaceFocus = useWorkThreadStore((s) => s.workspaceFocus);

  const relatedSparks = useMemo(
    () =>
      currentThread
        ? streamEntries.filter(
            (entry) =>
              entry.entryType === 'spark' &&
              (entry.threadMeta?.sourceThreadId === currentThread.id ||
                entry.threadMeta?.promotedThreadId === currentThread.id),
          )
        : [],
    [currentThread, streamEntries],
  );

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

  const openSparkInStream = (entryId: string) => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem('mlt-stream-scroll-to', entryId);
    window.dispatchEvent(
      new CustomEvent('mlt-navigate', {
        detail: { view: 'stream' },
      }),
    );
  };

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
        onDropMarkdown={(markdown) =>
          updateDoc(
            `${currentThread.docMarkdown.replace(/\s+$/u, '')}${currentThread.docMarkdown.trim() ? '\n\n' : ''}${markdown.trim()}`.trim(),
          )
        }
        leftSidebar={
          <MaterialSidebar
            currentRoleId={currentRoleId}
            onInsertMarkdown={(markdown) => void updateExplorationMarkdown(`${currentThread.explorationMarkdown.trim()}\n\n${markdown}`.trim())}
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
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span style={{ color: 'var(--color-text-tertiary)' }}>
                  {`单文档工作面 · ${getWorkThreadFocusLabel(currentThread, workspaceFocus)}`}
                </span>
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)' }}
                >
                  {t(`energy_${energyLevel}`, { ns: 'coach' })}
                </span>
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{
                    color: 'var(--color-text-secondary)',
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {t(`work_mode_${workMode}`, { ns: 'coach' })}
                </span>
                {workStateNote ? (
                  <span style={{ color: 'var(--color-text-tertiary)' }}>{workStateNote}</span>
                ) : null}
              </div>
            </div>
          </div>
        }
        centerBody={
          <WorkThreadDocumentEditor
            thread={currentThread}
            relatedSparks={relatedSparks}
            onUpdateDoc={updateDoc}
            onOpenSparkInStream={openSparkInStream}
          />
        }
        rightSidebar={
          <WorkThreadRuntimeSidebar
            thread={currentThread}
            events={currentEvents}
            relatedSparks={relatedSparks}
            onResume={() => void dispatchThread(currentThread.id, 'manual')}
            onCheckpoint={() => void saveCheckpoint()}
            onStatusChange={(status) => void setStatus(status)}
            onToggleWaiting={(id) => void toggleWaitingSatisfied(id)}
            onToggleNextAction={(id) => void toggleNextActionDone(id)}
            onCreateTaskFromNextAction={(id) => void createTaskFromNextAction(id)}
            onSetIntentState={(id, state) => void setIntentState(id, state)}
            onPromoteIntent={(id) => void promoteIntentToNextAction(id)}
            onCaptureIntentAsSpark={(id) => void captureIntentAsSpark(id)}
            onCreateThreadFromIntent={(id) => void createThreadFromIntent(id)}
            onResolveInterrupt={(id) => void resolveInterrupt(id)}
            onOpenSparkInStream={openSparkInStream}
            onCreateThreadFromSpark={(entryId) => void createThreadFromSpark(entryId)}
            onCreateTaskFromSpark={(entryId) => void createTaskFromSpark(entryId)}
            onArchiveSpark={(entryId) => void archiveSpark(entryId)}
          />
        }
      />
    </div>
  );
}
