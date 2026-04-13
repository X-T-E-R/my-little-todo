import type { ThinkSessionStartMode } from '@my-little-todo/core';
import { History, PanelLeft } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSetting } from '../storage/settingsApi';
import { useRoleStore, useThinkSessionStore } from '../stores';
import { useIsMobile } from '../utils/useIsMobile';
import type { ThinkSessionEditorHandle } from './ThinkSessionEditor';
import { ThinkSessionEditor } from './ThinkSessionEditor';
import { ThinkSessionHistory } from './ThinkSessionHistory';
import { ThinkSessionModeSelector } from './ThinkSessionModeSelector';
import { ThinkSessionSidebar } from './ThinkSessionSidebar';
import { ThinkSessionToolbar } from './ThinkSessionToolbar';
import { WorkThreadView } from './WorkThreadView';

const THINK_SIDEBAR_KEY = 'mlt-think-sidebar-open';

function loadThinkSidebarOpen(): boolean {
  try {
    const v = localStorage.getItem(THINK_SIDEBAR_KEY);
    if (v === null) return true;
    return v === 'true';
  } catch {
    return true;
  }
}

async function resolveThinkSidebarOpen(): Promise<boolean> {
  try {
    const localValue = localStorage.getItem(THINK_SIDEBAR_KEY);
    if (localValue !== null) return localValue === 'true';
  } catch {
    /* ignore */
  }
  return (await getSetting('think-session:sidebar-default-open')) !== 'false';
}

export function ThinkSessionView({
  onGoNow,
}: {
  onGoNow: () => void;
}) {
  const { t } = useTranslation('think');
  const isMobile = useIsMobile();
  const currentRoleId = useRoleStore((s) => s.currentRoleId);

  const currentSession = useThinkSessionStore((s) => s.currentSession);
  const workspaceMode = useThinkSessionStore((s) => s.workspaceMode);
  const aiBusy = useThinkSessionStore((s) => s.aiBusy);
  const historyOpen = useThinkSessionStore((s) => s.historyOpen);
  const sessions = useThinkSessionStore((s) => s.sessions);
  const saveError = useThinkSessionStore((s) => s.saveError);

  const ensureSession = useThinkSessionStore((s) => s.ensureSession);
  const setStartModeAndSeed = useThinkSessionStore((s) => s.setStartModeAndSeed);
  const updateContent = useThinkSessionStore((s) => s.updateContent);
  const loadHistory = useThinkSessionStore((s) => s.loadHistory);
  const setHistoryOpen = useThinkSessionStore((s) => s.setHistoryOpen);
  const openSessionReadonly = useThinkSessionStore((s) => s.openSessionReadonly);
  const deleteSession = useThinkSessionStore((s) => s.deleteSession);
  const runAiExtract = useThinkSessionStore((s) => s.runAiExtract);
  const toggleActionAdopted = useThinkSessionStore((s) => s.toggleActionAdopted);
  const applyAdoptedActions = useThinkSessionStore((s) => s.applyAdoptedActions);
  const setStreamMode = useThinkSessionStore((s) => s.setStreamMode);
  const flushSave = useThinkSessionStore((s) => s.flushSave);
  const editorKey = useThinkSessionStore((s) => s.editorKey);

  const editorRef = useRef<ThinkSessionEditorHandle>(null);
  const [sidebarOpen, setSidebarOpen] = useState(loadThinkSidebarOpen);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  useEffect(() => {
    if (workspaceMode === 'session') {
      void ensureSession();
    }
  }, [ensureSession, workspaceMode]);

  useEffect(() => {
    let cancelled = false;
    void resolveThinkSidebarOpen().then((next) => {
      if (!cancelled) setSidebarOpen(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    return () => {
      void useThinkSessionStore.getState().flushSave();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(THINK_SIDEBAR_KEY, sidebarOpen ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [sidebarOpen]);

  const handleFinish = useCallback(async () => {
    await flushSave();
    setStreamMode('stream');
    useThinkSessionStore.setState({ currentSession: null });
  }, [flushSave, setStreamMode]);

  const handleGoNow = useCallback(() => {
    void flushSave();
    onGoNow();
  }, [flushSave, onGoNow]);

  const handleInsertTask = useCallback((markdown: string) => {
    editorRef.current?.insertText(markdown);
  }, []);

  const handleModeSelect = useCallback(
    (mode: ThinkSessionStartMode) => {
      void setStartModeAndSeed(mode);
    },
    [setStartModeAndSeed],
  );

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileSheetOpen((o) => !o);
    } else {
      setSidebarOpen((o) => !o);
    }
  }, [isMobile]);

  if (workspaceMode === 'session' && !currentSession) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('loading_session')}
        </p>
      </div>
    );
  }

  const startMode: ThinkSessionStartMode = currentSession?.startMode ?? 'blank';

  const sidebarInner = (
    <ThinkSessionSidebar currentRoleId={currentRoleId} onInsertTask={handleInsertTask} />
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {workspaceMode === 'thread' ? (
        <WorkThreadView onGoNow={onGoNow} />
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-row">
          {!isMobile && sidebarOpen && (
            <aside
              className="flex h-full min-h-0 w-60 shrink-0 flex-col border-r border-[var(--color-border)]"
              aria-label={t('sidebar_aria')}
            >
              {sidebarInner}
            </aside>
          )}

          {isMobile && mobileSheetOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-30 bg-black/40"
                aria-label={t('close')}
                onClick={() => setMobileSheetOpen(false)}
              />
              <aside
                className="fixed inset-y-0 left-0 z-40 flex h-full w-[min(16rem,88vw)] flex-col border-r border-[var(--color-border)] shadow-2xl"
                style={{ background: 'var(--color-bg)' }}
              >
                {sidebarInner}
              </aside>
            </>
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3 pb-3 pt-2">
            <header className="mb-2 flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={toggleSidebar}
                className="shrink-0 rounded-lg border p-2"
                style={{
                  borderColor: 'var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-secondary)',
                }}
                title={t('sidebar_toggle')}
                aria-label={t('sidebar_toggle')}
              >
                <PanelLeft size={18} aria-hidden />
              </button>
              <h2
                className="min-w-0 flex-1 text-sm font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                {t('panel_title')}
              </h2>
              <ThinkSessionModeSelector
                currentMode={startMode}
                content={currentSession?.content ?? ''}
                aiBusy={aiBusy}
                onSelectMode={handleModeSelect}
              />
              <button
                type="button"
                onClick={() => {
                  void loadHistory();
                  setHistoryOpen(true);
                }}
                className="flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                <History size={14} />
                {t('history_open')}
              </button>
            </header>

            {saveError && (
              <p className="mb-2 text-[11px]" style={{ color: 'var(--color-danger, #c00)' }}>
                {saveError}
              </p>
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <ThinkSessionEditor
                ref={editorRef}
                sessionId={`${currentSession?.id ?? 'pending'}-${editorKey}`}
                initialMarkdown={currentSession?.content ?? ''}
                onMarkdownChange={(md) => updateContent(md)}
              />

              <ThinkSessionToolbar
                aiBusy={aiBusy}
                actions={currentSession?.extractedActions}
                onAiExtract={() => void runAiExtract()}
                onApplyActions={() => void applyAdoptedActions()}
                onDone={() => void handleFinish()}
                onNavigateNow={handleGoNow}
                onToggleAction={toggleActionAdopted}
              />
            </div>
          </div>

          <ThinkSessionHistory
            open={historyOpen}
            sessions={sessions}
            onClose={() => setHistoryOpen(false)}
            onOpen={(id) => void openSessionReadonly(id)}
            onDelete={(id) => void deleteSession(id)}
          />
        </div>
      )}
    </div>
  );
}
