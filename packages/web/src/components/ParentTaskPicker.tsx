import type { Task } from '@my-little-todo/core';
import { displayTaskTitle } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, FolderKanban, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskStore } from '../stores/taskStore';

function getDescendantIds(taskId: string, tasks: Task[]): Set<string> {
  const ids = new Set<string>();
  const queue = [taskId];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    ids.add(current);
    const task = tasks.find((t) => t.id === current);
    for (const childId of task?.subtaskIds ?? []) {
      if (!ids.has(childId)) queue.push(childId);
    }
  }
  return ids;
}

interface ParentTaskPickerProps {
  childId: string;
  onSelect: (parentId: string) => void;
  onClose: () => void;
}

export function ParentTaskPicker({ childId, onSelect, onClose }: ParentTaskPickerProps) {
  const { t } = useTranslation('task');
  const tasks = useTaskStore((s) => s.tasks);
  const [query, setQuery] = useState('');

  const excluded = useMemo(() => getDescendantIds(childId, tasks), [childId, tasks]);

  const candidates = useMemo(() => {
    const q = query.toLowerCase().trim();
    return tasks.filter((task) => {
      if (excluded.has(task.id)) return false;
      if (task.status === 'completed' || task.status === 'archived') return false;
      const hay = `${displayTaskTitle(task)} ${task.body}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      return true;
    });
  }, [tasks, excluded, query]);

  const projectCandidates = useMemo(
    () => candidates.filter((task) => task.taskType === 'project'),
    [candidates],
  );
  const otherCandidates = useMemo(
    () => candidates.filter((task) => task.taskType !== 'project'),
    [candidates],
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t('Select parent task')}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-[var(--color-bg)]"
            >
              <X size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            </button>
          </div>

          <div className="px-4 py-2">
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
            >
              <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Search tasks...')}
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--color-text)' }}
              />
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto px-2 pb-3">
            {candidates.length === 0 ? (
              <p
                className="text-center text-xs py-6"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {t('No tasks found')}
              </p>
            ) : (
              <>
                {projectCandidates.length > 0 && (
                  <div className="pt-1">
                    <div
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <FolderKanban size={12} />
                      {t('Projects')}
                    </div>
                    {projectCandidates.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onSelect(task.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] rounded-lg transition-colors hover:bg-[var(--color-bg)]"
                        style={{ color: 'var(--color-text)' }}
                      >
                        <FolderKanban
                          size={14}
                          className="shrink-0 opacity-80"
                          style={{ color: 'var(--color-accent)' }}
                        />
                        <span className="truncate">{displayTaskTitle(task)}</span>
                        {task.ddl && (
                          <span
                            className="ml-auto text-[10px] shrink-0"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            {task.ddl.toLocaleDateString()}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {projectCandidates.length > 0 && otherCandidates.length > 0 && (
                  <div
                    className="mx-2 my-1"
                    style={{ borderTop: '1px solid var(--color-border)' }}
                  />
                )}
                {otherCandidates.length > 0 && (
                  <div className={projectCandidates.length > 0 ? 'pt-0' : 'pt-1'}>
                    {otherCandidates.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onSelect(task.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] rounded-lg transition-colors hover:bg-[var(--color-bg)]"
                        style={{ color: 'var(--color-text)' }}
                      >
                        <Check size={14} className="shrink-0 opacity-0" />
                        <span className="truncate">{displayTaskTitle(task)}</span>
                        {task.ddl && (
                          <span
                            className="ml-auto text-[10px] shrink-0"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            {task.ddl.toLocaleDateString()}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
