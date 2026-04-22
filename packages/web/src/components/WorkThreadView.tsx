import { buildWorkThreadBlockStats } from '@my-little-todo/core';
import { useEffect, useMemo, useState } from 'react';
import { useRoleStore, useStreamStore, useTaskStore, useWorkThreadStore } from '../stores';
import { decideInitialThreadRoute } from '../utils/workThreadUiPrefs';
import { MaterialSidebar } from './think-session/MaterialSidebar';
import { WorkThreadBoard } from './work-thread/WorkThreadBoard';
import { WorkThreadDocumentEditor } from './work-thread/WorkThreadDocumentEditor';
import { WorkThreadEditorShell } from './work-thread/WorkThreadEditorShell';
import { WorkThreadRuntimeSidebar } from './work-thread/WorkThreadRuntimeSidebar';

export function WorkThreadView({ onGoNow }: { onGoNow: () => void }) {
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
  const updateThreadState = useWorkThreadStore((s) => s.updateThreadState);
  const updateDoc = useWorkThreadStore((s) => s.updateDoc);
  const flushSave = useWorkThreadStore((s) => s.flushSave);
  const saveCheckpoint = useWorkThreadStore((s) => s.saveCheckpoint);
  const addTaskToThread = useWorkThreadStore((s) => s.addTaskToThread);
  const addStreamToThread = useWorkThreadStore((s) => s.addStreamToThread);
  const promoteBlockToStream = useWorkThreadStore((s) => s.promoteBlockToStream);
  const createTaskFromBlock = useWorkThreadStore((s) => s.createTaskFromBlock);
  const syncStatus = useWorkThreadStore((s) => s.syncStatus);
  const syncMessage = useWorkThreadStore((s) => s.syncMessage);
  const pendingExternalThread = useWorkThreadStore((s) => s.pendingExternalThread);
  const [runtimeFocusRequest, setRuntimeFocusRequest] = useState<'next' | 'pause' | null>(null);

  const relatedSparks = useMemo(() => {
    if (!currentThread) return [];
    const promotedIds = new Set(
      currentThread.blocks
        .map((block) => block.promotedStreamEntryId)
        .filter((value): value is string => Boolean(value)),
    );
    return streamEntries.filter(
      (entry) =>
        promotedIds.has(entry.id) ||
        entry.threadMeta?.sourceThreadId === currentThread.id ||
        entry.threadMeta?.promotedThreadId === currentThread.id,
    );
  }, [currentThread, streamEntries]);

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

  const openSparkInStream = (entryId: string) => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem('mlt-stream-scroll-to', entryId);
    window.dispatchEvent(
      new CustomEvent('mlt-navigate', {
        detail: { view: 'stream' },
      }),
    );
  };

  const openThreadStatePanel = (focus: 'next' | 'pause') => {
    setRuntimeFocusRequest(focus);
    if (!runtimeSidebarOpen) {
      void setRuntimeSidebarOpen(true);
    }
  };

  if ((threadListOpen || !currentThread) && loading && threads.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          线程加载中…
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

  const stats = buildWorkThreadBlockStats(currentThread);

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
          backLabel="线程列表"
          onGoNow={onGoNow}
          materialSidebarOpen={materialSidebarOpen}
          runtimeSidebarOpen={runtimeSidebarOpen}
        onToggleMaterialSidebar={() => void setMaterialSidebarOpen(!materialSidebarOpen)}
        onToggleRuntimeSidebar={() => void setRuntimeSidebarOpen(!runtimeSidebarOpen)}
        onDropMarkdown={(markdown) =>
          updateDoc(
            `${currentThread.docMarkdown.replace(/\s+$/u, '')}${currentThread.docMarkdown.trim() ? '\n\n' : ''}${markdown.trim()}`.trim(),
          )
        }
        leftSidebar={
          <MaterialSidebar
            currentRoleId={currentRoleId}
            onInsertMarkdown={(markdown) =>
              updateDoc(
                `${currentThread.docMarkdown.replace(/\s+$/u, '')}${currentThread.docMarkdown.trim() ? '\n\n' : ''}${markdown.trim()}`.trim(),
              )
            }
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
                <div className="min-w-0 flex-1">外部 Markdown 有更新。</div>
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
                    保留当前
                  </button>
                  <button
                    type="button"
                    onClick={() => void reloadFromPendingExternal()}
                    className="rounded-xl px-3 py-2 text-[11px] font-semibold text-white"
                    style={{ background: 'var(--color-accent)' }}
                  >
                    重新载入
                  </button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {syncStatus === 'synced'
                  ? '已同步'
                  : syncStatus === 'syncing'
                    ? '同步中'
                    : syncStatus === 'disabled'
                      ? '仅内部存储'
                      : syncStatus === 'external-change'
                        ? '外部有更新'
                        : syncMessage}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span style={{ color: 'var(--color-text-tertiary)' }}>
                  {`Mission ${stats.missions} · Task ${stats.tasks} · Spark ${stats.sparks} · Log ${stats.logs}`}
                </span>
                {currentThread.resume ? (
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)' }}
                  >
                    {`Next: ${currentThread.resume}`}
                  </span>
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
            onOpenThreadState={openThreadStatePanel}
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
            onUpdateThreadState={(patch) => void updateThreadState(patch)}
            onPromoteBlockToStream={(blockId) => void promoteBlockToStream(blockId)}
            onCreateTaskFromBlock={(blockId) => void createTaskFromBlock(blockId)}
            onOpenSparkInStream={openSparkInStream}
            focusRequest={runtimeFocusRequest}
            onFocusConsumed={() => setRuntimeFocusRequest(null)}
          />
        }
      />
    </div>
  );
}
