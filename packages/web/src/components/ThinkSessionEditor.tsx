import { forwardRef, useEffect, useState } from 'react';
import {
  type TaskRefRenderMode,
  loadThinkSessionSettings,
} from '../features/think-session/ThinkSessionSettings';
import {
  type MarkdownWorkThreadFocusContext,
  type MarkdownSlashCommand,
  type MarkdownSlashCommandSelection,
  RichMarkdownEditor,
  type RichMarkdownEditorHandle,
} from './RichMarkdownEditor';

export type ThinkSessionEditorHandle = RichMarkdownEditorHandle;

export const ThinkSessionEditor = forwardRef<
  ThinkSessionEditorHandle,
  {
    sessionId: string;
    initialMarkdown: string;
    onMarkdownChange: (markdown: string) => void;
    slashCommands?: MarkdownSlashCommand[];
    onSlashCommand?: (payload: MarkdownSlashCommandSelection) => void;
    nativeSlashUi?: 'auto' | 'off';
    editorClassName?: string;
    onSparkRefOpen?: (entryId: string) => void;
    intentRefs?: boolean;
    nextRefs?: boolean;
    blockRefs?: boolean;
    threadCallouts?: boolean;
    onWorkThreadFocusChange?: (focus: MarkdownWorkThreadFocusContext) => void;
  }
>(function ThinkSessionEditor(
  {
    sessionId,
    initialMarkdown,
    onMarkdownChange,
    slashCommands,
    onSlashCommand,
    nativeSlashUi = 'auto',
    editorClassName = '',
    onSparkRefOpen,
    intentRefs = false,
    nextRefs = false,
    blockRefs = false,
    threadCallouts = false,
    onWorkThreadFocusChange,
  },
  ref,
) {
  const [taskRefMode, setTaskRefMode] = useState<TaskRefRenderMode>('inline-chip');
  const [editorDensity, setEditorDensity] = useState<'balanced' | 'focused'>('balanced');

  useEffect(() => {
    let cancelled = false;
    void loadThinkSessionSettings().then((settings) => {
      if (cancelled) return;
      setTaskRefMode(settings.taskRefRenderMode);
      setEditorDensity(settings.editorDensity);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RichMarkdownEditor
      ref={ref}
      editorId={sessionId}
      initialMarkdown={initialMarkdown}
      onMarkdownChange={onMarkdownChange}
      variant="immersive"
      topBar
      toolbar
      blockEdit
      taskRefs
      sparkRefs
      intentRefs={intentRefs}
      nextRefs={nextRefs}
      blockRefs={blockRefs}
      threadCallouts={threadCallouts}
      taskRefAutocomplete
      taskRefMode={taskRefMode}
      slashCommands={slashCommands}
      onSlashCommand={onSlashCommand}
      nativeSlashUi={nativeSlashUi}
      onSparkRefOpen={onSparkRefOpen}
      onWorkThreadFocusChange={onWorkThreadFocusChange}
      className={`min-h-0 flex-1 think-session-editor ${
        editorDensity === 'focused' ? 'think-session-editor--focused' : ''
      } ${editorClassName}`.trim()}
    />
  );
});
