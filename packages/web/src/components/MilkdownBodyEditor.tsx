import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/frame.css';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { useRef } from 'react';

function MilkdownInner({
  taskId,
  initialMarkdown,
  onMarkdownChange,
}: {
  taskId: string;
  initialMarkdown: string;
  onMarkdownChange: (markdown: string) => void;
}) {
  const cbRef = useRef(onMarkdownChange);
  cbRef.current = onMarkdownChange;

  useEditor(
    (root) => {
      const crepe = new Crepe({
        root,
        defaultValue: initialMarkdown || '',
      });
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          cbRef.current(markdown);
        });
      });
      return crepe;
    },
    [taskId],
  );

  return (
    <div className="milkdown-task-body min-h-[120px] rounded-xl overflow-hidden text-[13px]">
      <Milkdown />
    </div>
  );
}

/** WYSIWYG Markdown editor (Milkdown Crepe). Remount when `taskId` changes. */
export function MilkdownBodyEditor({
  taskId,
  initialMarkdown,
  onMarkdownChange,
}: {
  taskId: string;
  initialMarkdown: string;
  onMarkdownChange: (markdown: string) => void;
}) {
  return (
    <MilkdownProvider key={taskId}>
      <MilkdownInner
        taskId={taskId}
        initialMarkdown={initialMarkdown}
        onMarkdownChange={onMarkdownChange}
      />
    </MilkdownProvider>
  );
}
