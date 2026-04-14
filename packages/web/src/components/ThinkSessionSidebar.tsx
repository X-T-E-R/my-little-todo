import { useTaskStore } from '../stores';
import { MaterialSidebar } from './think-session/MaterialSidebar';

export function ThinkSessionSidebar({
  currentRoleId,
  onInsertTask,
}: {
  currentRoleId: string | null;
  onInsertTask: (markdown: string) => void;
}) {
  const selectTask = useTaskStore((s) => s.selectTask);

  return (
    <MaterialSidebar
      currentRoleId={currentRoleId}
      onInsertMarkdown={onInsertTask}
      onOpenTask={(taskId) => selectTask(taskId)}
    />
  );
}
