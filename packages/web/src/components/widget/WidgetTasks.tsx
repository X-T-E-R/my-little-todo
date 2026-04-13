import { displayTaskTitle, taskRoleIds } from '@my-little-todo/core';
import type { Task } from '@my-little-todo/core';
import { emitTo } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import { isTauriEnv } from '../../utils/platform';
import type { WidgetRoleMode } from './WidgetRoleSelect';

const MAX_ITEMS = 8;

function pickTasksForRoles(tasks: Task[], roleIds: string[] | null): Task[] {
  const open = tasks.filter((t) => t.status === 'active' || t.status === 'today');
  const filtered =
    roleIds === null || roleIds.length === 0
      ? open
      : open.filter((t) => {
          const tr = taskRoleIds(t);
          if (tr.length === 0) return false;
          return tr.some((id) => roleIds.includes(id));
        });
  const sorted = [...filtered].sort((a, b) => {
    const ad = a.ddl?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bd = b.ddl?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });
  return sorted.slice(0, MAX_ITEMS);
}

interface WidgetTasksProps {
  tasks: Task[];
  effectiveRoleIds: string[] | null;
  filterMode: WidgetRoleMode;
}

export function WidgetTasks({ tasks, effectiveRoleIds, filterMode }: WidgetTasksProps) {
  const { t } = useTranslation('widget');
  const shown = pickTasksForRoles(tasks, effectiveRoleIds);

  const openTask = async (taskId: string) => {
    if (!isTauriEnv()) return;
    try {
      await emitTo('main', 'mlt-focus-task', { taskId });
    } catch {
      /* */
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1">
      {filterMode === 'auto' && (
        <p className="mb-2 text-[10px] text-[var(--color-text-tertiary)]">
          {t('widget_hint_auto_filter')}
        </p>
      )}
      <ul className="space-y-0.5">
        {shown.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => void openTask(task.id)}
              className="widget-task-row flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-[5px] text-left transition-colors duration-100"
            >
              <span className="widget-task-bar mt-[3px] inline-block h-3.5 w-[3px] shrink-0 rounded-full bg-[var(--color-accent)] opacity-50" />
              <span className="widget-task-label truncate text-xs leading-snug text-[var(--color-text)] opacity-90">
                {displayTaskTitle(task)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {shown.length === 0 && (
        <p className="py-6 text-center text-[11px] text-[var(--color-text-tertiary)]">
          {t('empty_calm')}
        </p>
      )}
    </div>
  );
}
