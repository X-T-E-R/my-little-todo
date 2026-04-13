import { forwardRef, useEffect, useState } from 'react';
import { RichMarkdownEditor, type RichMarkdownEditorHandle } from './RichMarkdownEditor';
import { type TaskRefRenderMode, loadThinkSessionSettings } from './ThinkSessionSettings';

export type ThinkSessionEditorHandle = RichMarkdownEditorHandle;

export const ThinkSessionEditor = forwardRef<
  ThinkSessionEditorHandle,
  {
    sessionId: string;
    initialMarkdown: string;
    onMarkdownChange: (markdown: string) => void;
  }
>(function ThinkSessionEditor({ sessionId, initialMarkdown, onMarkdownChange }, ref) {
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
      className={`min-h-0 flex-1 think-session-editor ${
        editorDensity === 'focused' ? 'think-session-editor--focused' : ''
      }`}
    />
  );
});
