import type { Task } from '@my-little-todo/core';
import { daysUntil, displayTaskTitle, projectDirectChildProgress } from '@my-little-todo/core';
import { FolderKanban, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { filterByRole, getTasksWithDdl, getTasksWithoutDdl, useTaskStore } from '../stores';
import { formatTaskRefMarkdown } from '../utils/taskRefs';

const DDL_SOON_DAYS = 7;

function matchesQuery(task: Task, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  return displayTaskTitle(task).toLowerCase().includes(s);
}

export function ThinkSessionSidebar({
  currentRoleId,
  onInsertTask,
}: {
  currentRoleId: string | null;
  onInsertTask: (markdown: string) => void;
}) {
  const { t } = useTranslation('think');
  const tasks = useTaskStore((s) => s.tasks);
  const [query, setQuery] = useState('');

  const { ddlSoon, noDdlActive, projects } = useMemo(() => {
    const withDdl = filterByRole(getTasksWithDdl(tasks), currentRoleId).filter((x) => {
      const d = x.ddl ? daysUntil(x.ddl) : null;
      return d !== null && d <= DDL_SOON_DAYS;
    });
    const ddlSoonList = withDdl.slice(0, 8).filter((x) => matchesQuery(x, query));

    const withoutDdl = filterByRole(getTasksWithoutDdl(tasks), currentRoleId)
      .filter((x) => matchesQuery(x, query))
      .slice(0, 20);

    const projectList = filterByRole(
      tasks.filter(
        (x) => x.taskType === 'project' && x.status !== 'archived' && x.status !== 'completed',
      ),
      currentRoleId,
    )
      .filter((x) => matchesQuery(x, query))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 12);

    return { ddlSoon: ddlSoonList, noDdlActive: withoutDdl, projects: projectList };
  }, [tasks, currentRoleId, query]);

  const handleClick = (task: Task) => {
    onInsertTask(formatTaskRefMarkdown(task));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg)]">
      <div className="shrink-0 border-b border-[var(--color-border)] p-2">
        <div
          className="flex items-center gap-2 rounded-lg px-2 py-1.5"
          style={{ background: 'var(--color-surface)' }}
        >
          <Search size={14} className="shrink-0 opacity-50" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sidebar_search_placeholder')}
            className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
            style={{ color: 'var(--color-text)' }}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-2 text-[11px]">
        <section>
          <p className="mb-1.5 font-semibold uppercase tracking-wide opacity-60">
            {t('sidebar_ddl_soon')}
          </p>
          <ul className="space-y-0.5">
            {ddlSoon.map((task) => (
              <li key={task.id}>
                <TaskRow task={task} onPick={() => handleClick(task)} />
              </li>
            ))}
            {ddlSoon.length === 0 && (
              <li className="opacity-50" style={{ color: 'var(--color-text-tertiary)' }}>
                —
              </li>
            )}
          </ul>
        </section>
        <section>
          <p className="mb-1.5 font-semibold uppercase tracking-wide opacity-60">
            {t('sidebar_active_tasks')}
          </p>
          <ul className="space-y-0.5">
            {noDdlActive.map((task) => (
              <li key={task.id}>
                <TaskRow task={task} onPick={() => handleClick(task)} />
              </li>
            ))}
            {noDdlActive.length === 0 && (
              <li className="opacity-50" style={{ color: 'var(--color-text-tertiary)' }}>
                —
              </li>
            )}
          </ul>
        </section>
        <section>
          <p className="mb-1.5 flex items-center gap-1 font-semibold uppercase tracking-wide opacity-60">
            <FolderKanban size={12} aria-hidden />
            {t('sidebar_projects')}
          </p>
          <ul className="space-y-0.5">
            {projects.map((p) => {
              const { total, completed } = projectDirectChildProgress(p, tasks);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    title={displayTaskTitle(p)}
                    onClick={() => handleClick(p)}
                    className="flex w-full items-center justify-between gap-1 rounded-md px-1.5 py-1 text-left hover:bg-[var(--color-surface)]"
                    style={{ color: 'var(--color-text)' }}
                  >
                    <span className="min-w-0 truncate">{displayTaskTitle(p)}</span>
                    <span className="shrink-0 opacity-60">
                      {completed}/{total}
                    </span>
                  </button>
                </li>
              );
            })}
            {projects.length === 0 && (
              <li className="opacity-50" style={{ color: 'var(--color-text-tertiary)' }}>
                —
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

function TaskRow({ task, onPick }: { task: Task; onPick: () => void }) {
  const du = task.ddl ? daysUntil(task.ddl) : null;
  const ddlLabel =
    task.ddl && du !== null ? `${du}d · ${task.ddl.toLocaleDateString()}` : undefined;
  return (
    <button
      type="button"
      title={ddlLabel}
      onClick={onPick}
      className="w-full rounded-md px-1.5 py-1 text-left hover:bg-[var(--color-surface)]"
      style={{ color: 'var(--color-text)' }}
    >
      <span className="line-clamp-2">{displayTaskTitle(task)}</span>
      {ddlLabel && <span className="mt-0.5 block text-[10px] opacity-60">{ddlLabel}</span>}
    </button>
  );
}
