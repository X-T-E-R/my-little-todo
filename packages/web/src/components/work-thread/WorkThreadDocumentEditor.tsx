import type { StreamEntry, WorkThread } from '@my-little-todo/core';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkThreadStore } from '../../stores';
import {
  type MarkdownSlashCommandSelection,
  type MarkdownWorkThreadFocusContext,
} from '../RichMarkdownEditor';
import { ThinkSessionEditor, type ThinkSessionEditorHandle } from '../ThinkSessionEditor';
import {
  getWorkThreadFocusLabel,
  normalizeWorkThreadFocus,
  resolveWorkThreadFocusByContainerPath,
  type WorkThreadWorkspaceFocus,
} from '../../utils/workThreadFocus';
import { insertIntoWorkThreadDoc, type WorkThreadDocInsertKind } from '../../utils/workThreadDocInsert';
import { WorkThreadInlineMenu, getWorkThreadSlashCommands } from './WorkThreadInlineMenu';

interface WorkThreadDocumentEditorProps {
  thread: WorkThread;
  relatedSparks: StreamEntry[];
  onUpdateDoc: (markdown: string) => void;
  onOpenSparkInStream: (entryId: string) => void;
}

function resolveDocumentFocus(
  thread: WorkThread,
  focus: MarkdownWorkThreadFocusContext,
): WorkThreadWorkspaceFocus {
  if (focus.kind === 'exploration') {
    return normalizeWorkThreadFocus(thread, {
      kind: 'exploration',
      containerPath: focus.containerPath,
      title: focus.title,
    });
  }
  if (focus.kind === 'intent') {
    return resolveWorkThreadFocusByContainerPath(thread, {
      kind: 'intent',
      containerPath: focus.containerPath,
      title: focus.title,
    });
  }
  if (focus.kind === 'spark') {
    return resolveWorkThreadFocusByContainerPath(thread, {
      kind: 'spark',
      containerPath: focus.containerPath,
      title: focus.title,
    });
  }
  return { kind: 'root' };
}

function resolveCommandInsert(
  commandId: string,
): { kind: WorkThreadDocInsertKind; seed: string } | null {
  if (commandId === 'intent') {
    return {
      kind: 'intent',
      seed: '意图标题\n在这里继续推进这条意图',
    };
  }
  if (commandId === 'spark') {
    return {
      kind: 'spark',
      seed: 'Spark 标题\n在这里展开这个分支想法',
    };
  }
  if (commandId === 'next-action') {
    return {
      kind: 'next',
      seed: '下一步',
    };
  }
  if (commandId === 'block') {
    return {
      kind: 'block',
      seed: '卡点标题\n补充卡住原因或前置条件',
    };
  }
  return null;
}

export function WorkThreadDocumentEditor({
  thread,
  relatedSparks,
  onUpdateDoc,
  onOpenSparkInStream,
}: WorkThreadDocumentEditorProps) {
  const { t } = useTranslation('think');
  const editorRef = useRef<ThinkSessionEditorHandle>(null);
  const slashCommands = useMemo(() => getWorkThreadSlashCommands(t), [t]);
  const workspaceFocus = useWorkThreadStore((s) => s.workspaceFocus);
  const setWorkspaceFocus = useWorkThreadStore((s) => s.setWorkspaceFocus);
  const workspaceAutoFocusId = useWorkThreadStore((s) => s.workspaceAutoFocusId);
  const requestWorkspaceAutoFocus = useWorkThreadStore((s) => s.requestWorkspaceAutoFocus);

  const applyDocCommand = useCallback(
    (commandId: string) => {
      const command = resolveCommandInsert(commandId);
      if (!command) return;
      const currentMarkdown = editorRef.current?.getMarkdown() ?? thread.docMarkdown;
      const nextDoc = insertIntoWorkThreadDoc(
        { ...thread, docMarkdown: currentMarkdown },
        workspaceFocus,
        command.kind,
        command.seed,
      );
      onUpdateDoc(nextDoc);
      window.setTimeout(() => editorRef.current?.focus(), 0);
    },
    [onUpdateDoc, thread, workspaceFocus],
  );

  const handleInsertCommand = useCallback((commandId: string) => {
    applyDocCommand(commandId);
  }, [applyDocCommand]);

  const handleSlashCommand = useCallback((payload: MarkdownSlashCommandSelection) => {
    if (!resolveCommandInsert(payload.command.id)) return;
    editorRef.current?.replaceTextRange(payload.replaceFrom, payload.replaceTo, '');
    window.setTimeout(() => applyDocCommand(payload.command.id), 0);
  }, [applyDocCommand]);

  const handleFocusChange = useCallback(
    (focus: MarkdownWorkThreadFocusContext) => {
      setWorkspaceFocus(resolveDocumentFocus(thread, focus));
    },
    [setWorkspaceFocus, thread],
  );

  useEffect(() => {
    if (!workspaceAutoFocusId) return;
    const timer = window.setTimeout(() => requestWorkspaceAutoFocus(null), 300);
    if (thread.intents.some((item) => item.id === workspaceAutoFocusId)) {
      setWorkspaceFocus({ kind: 'intent', id: workspaceAutoFocusId });
      editorRef.current?.focus();
      return () => window.clearTimeout(timer);
    }
    if (thread.sparkContainers.some((item) => item.id === workspaceAutoFocusId)) {
      setWorkspaceFocus({ kind: 'spark', id: workspaceAutoFocusId });
      editorRef.current?.focus();
      return () => window.clearTimeout(timer);
    }
    editorRef.current?.focus();
    return () => window.clearTimeout(timer);
  }, [requestWorkspaceAutoFocus, setWorkspaceFocus, thread, workspaceAutoFocusId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <WorkThreadInlineMenu onOpenCommand={handleInsertCommand} />
          <div className="min-w-0 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {`当前落点：${getWorkThreadFocusLabel(thread, workspaceFocus)} · 已关联 sparks：${relatedSparks.length}`}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <ThinkSessionEditor
          ref={editorRef}
          sessionId={thread.id}
          initialMarkdown={thread.docMarkdown}
          onMarkdownChange={onUpdateDoc}
          slashCommands={slashCommands}
          onSlashCommand={handleSlashCommand}
          nativeSlashUi="off"
          onSparkRefOpen={onOpenSparkInStream}
          intentRefs
          nextRefs
          blockRefs
          threadCallouts
          onWorkThreadFocusChange={handleFocusChange}
          editorClassName="work-thread-document-editor"
        />
      </div>
    </div>
  );
}
