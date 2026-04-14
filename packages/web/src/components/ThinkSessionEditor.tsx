import { forwardRef, useEffect, useState } from 'react';
import {
  type TaskRefRenderMode,
  loadThinkSessionSettings,
} from '../features/think-session/ThinkSessionSettings';
import {
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
      taskRefAutocomplete
      taskRefMode={taskRefMode}
      slashCommands={slashCommands}
      onSlashCommand={onSlashCommand}
      nativeSlashUi={nativeSlashUi}
      className={`min-h-0 flex-1 think-session-editor ${
        editorDensity === 'focused' ? 'think-session-editor--focused' : ''
      } ${editorClassName}`.trim()}
    />
  );
});
