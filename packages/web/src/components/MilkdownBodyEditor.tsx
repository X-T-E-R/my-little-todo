import { forwardRef } from 'react';
import {
  RichMarkdownEditor,
  type RichMarkdownEditorHandle,
} from './RichMarkdownEditor';

/** Compact Markdown editor used in task detail. */
export const MilkdownBodyEditor = forwardRef<
  RichMarkdownEditorHandle,
  {
    taskId: string;
    initialMarkdown: string;
    onMarkdownChange: (markdown: string) => void;
    onPasteCapture?: (event: ClipboardEvent) => void;
  }
>(function MilkdownBodyEditor({ taskId, initialMarkdown, onMarkdownChange, onPasteCapture }, ref) {
  return (
    <RichMarkdownEditor
      ref={ref}
      editorId={taskId}
      initialMarkdown={initialMarkdown}
      onMarkdownChange={onMarkdownChange}
      onPasteCapture={onPasteCapture}
      variant="compact"
      topBar
      toolbar={false}
      blockEdit={false}
    />
  );
});
