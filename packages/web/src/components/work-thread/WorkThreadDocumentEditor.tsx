import { buildWorkThreadBlockStats, type StreamEntry, type WorkThread } from '@my-little-todo/core';
import { useMemo, useRef } from 'react';
import { type MarkdownSlashCommandSelection } from '../RichMarkdownEditor';
import { ThinkSessionEditor, type ThinkSessionEditorHandle } from '../ThinkSessionEditor';
import { buildWorkThreadSlashInsertion } from '../../utils/workThreadSlash';
import { WorkThreadInlineMenu, getWorkThreadSlashCommands } from './WorkThreadInlineMenu';

interface WorkThreadDocumentEditorProps {
  thread: WorkThread;
  relatedSparks: StreamEntry[];
  onUpdateDoc: (markdown: string) => void;
  onOpenSparkInStream: (entryId: string) => void;
  onOpenThreadState: (focus: 'pause' | 'next') => void;
}

export function WorkThreadDocumentEditor({
  thread,
  relatedSparks,
  onUpdateDoc,
  onOpenSparkInStream,
  onOpenThreadState,
}: WorkThreadDocumentEditorProps) {
  const editorRef = useRef<ThinkSessionEditorHandle>(null);
  const slashCommands = useMemo(() => getWorkThreadSlashCommands(), []);
  const stats = useMemo(() => buildWorkThreadBlockStats(thread), [thread]);

  const handleInsertCommand = (commandId: string) => {
    const snippet = buildWorkThreadSlashInsertion(commandId);
    if (!snippet) return;
    editorRef.current?.insertMarkdown(snippet.markdown, {
      text: snippet.selectionText,
      fallback: 'end',
    });
  };

  const handleSlashCommand = (payload: MarkdownSlashCommandSelection) => {
    const snippet = buildWorkThreadSlashInsertion(payload.command.id);
    if (!snippet) return;
    editorRef.current?.replaceMarkdownRange(payload.replaceFrom, payload.replaceTo, snippet.markdown, {
      text: snippet.selectionText,
      fallback: 'end',
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenThreadState('pause')}
              className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-bg)',
                color: 'var(--color-text-secondary)',
              }}
            >
              Pause
            </button>
            <button
              type="button"
              onClick={() => onOpenThreadState('next')}
              className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={{
                borderColor: 'color-mix(in srgb, var(--color-accent) 18%, var(--color-border))',
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
              }}
            >
              Next
            </button>
            <WorkThreadInlineMenu onOpenCommand={handleInsertCommand} />
          </div>
          <div className="min-w-0 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {`正文 ${thread.bodyMarkdown.trim() ? '已写' : '为空'} · Mission ${stats.missions} · Task ${stats.tasks} · Spark ${stats.sparks} · Log ${stats.logs} · 关联 sparks ${relatedSparks.length}`}
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
          threadCallouts
          editorClassName="work-thread-document-editor"
        />
      </div>
    </div>
  );
}
