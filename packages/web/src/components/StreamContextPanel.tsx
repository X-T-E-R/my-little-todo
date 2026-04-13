import type { StreamEntry } from '@my-little-todo/core';
import { type Task, displayTaskTitle, projectDirectChildProgress } from '@my-little-todo/core';
import { motion } from 'framer-motion';
import { Check, ChevronDown, ChevronRight, ExternalLink, Tag, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { filterByRole, formatDdlLabel } from '../stores';
import {
  type StreamContextPanelWidth,
  loadStreamContextPanelSettings,
} from './StreamContextPanelSettings';

const SECTIONS_KEY = 'mlt-stream-context-sections';

type SectionState = {
  projectsOpen: boolean;
  todayOpen: boolean;
  tagsOpen: boolean;
};

function loadSectionState(): SectionState {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    if (!raw) return { projectsOpen: true, todayOpen: true, tagsOpen: true };
    const j = JSON.parse(raw) as Partial<SectionState>;
    return {
      projectsOpen: j.projectsOpen !== false,
      todayOpen: j.todayOpen !== false,
      tagsOpen: j.tagsOpen !== false,
    };
  } catch {
    return { projectsOpen: true, todayOpen: true, tagsOpen: true };
  }
}

function saveSectionState(s: SectionState) {
  try {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function widthPx(w: StreamContextPanelWidth): number {
  switch (w) {
    case 'compact':
      return 192;
    case 'wide':
      return 320;
    default:
      return 256;
  }
}

export type StreamContextPanelProps = {
  tasks: Task[];
  entries: StreamEntry[];
  currentRoleId: string | null;
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onOpenProjectDetail: (projectId: string) => void;
  onOpenTask: (taskId: string) => void;
  onTagFilter: (tag: string) => void;
  onClose: () => void;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: aggregates projects / today / tags sections
export function StreamContextPanel({
  tasks,
  entries,
  currentRoleId,
  selectedProjectId,
  onSelectProject,
  onOpenProjectDetail,
  onOpenTask,
  onTagFilter,
  onClose,
}: StreamContextPanelProps) {
  const { t } = useTranslation('task');
  const { t: tStream } = useTranslation('stream');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [sections, setSections] = useState<SectionState>(loadSectionState);
  const [showProjects, setShowProjects] = useState(true);
  const [showToday, setShowToday] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [panelWidth, setPanelWidth] = useState<StreamContextPanelWidth>('normal');

  useEffect(() => {
    void loadStreamContextPanelSettings().then((s) => {
      setShowProjects(s.showProjects);
      setShowToday(s.showToday);
      setShowTags(s.showTags);
      setPanelWidth(s.panelWidth);
    });
  }, []);

  const updateSections = useCallback((patch: Partial<SectionState>) => {
    setSections((prev) => {
      const next = { ...prev, ...patch };
      saveSectionState(next);
      return next;
    });
  }, []);

  const projects = useMemo(() => {
    const raw = tasks.filter((x) => x.taskType === 'project');
    return filterByRole(raw, currentRoleId).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  }, [tasks, currentRoleId]);

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status !== 'completed'),
    [projects],
  );
  const completedProjects = useMemo(
    () => projects.filter((p) => p.status === 'completed'),
    [projects],
  );

  const todayTasks = useMemo(() => {
    const now = new Date();
    const raw = tasks.filter((task) => {
      if (task.status === 'completed') return false;
      if (task.status === 'today') return true;
      if (task.ddl && isSameCalendarDay(task.ddl, now)) return true;
      return false;
    });
    return filterByRole(raw, currentRoleId).sort((a, b) => {
      const ac = a.ddl?.getTime() ?? 0;
      const bc = b.ddl?.getTime() ?? 0;
      if (ac !== bc) return ac - bc;
      return displayTaskTitle(a).localeCompare(displayTaskTitle(b));
    });
  }, [tasks, currentRoleId]);

  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      for (const tag of e.tags ?? []) {
        const key = tag.trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag]) => tag);
  }, [entries]);

  const px = widthPx(panelWidth);
  const showTagsSection = showTags && topTags.length > 0;

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: px, opacity: 1 }}
      transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
      style={{ overflow: 'hidden' }}
      className="flex h-full min-h-0 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]"
      aria-label={tStream('Context panel')}
    >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-2 py-2">
          <span className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {tStream('Context')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 transition-colors hover:bg-[var(--color-bg)]"
            style={{ color: 'var(--color-text-tertiary)' }}
            title={tStream('Close panel')}
            aria-label={tStream('Close panel')}
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {showProjects && (
            <section className="mb-3">
              <button
                type="button"
                onClick={() => updateSections({ projectsOpen: !sections.projectsOpen })}
                className="mb-1.5 flex w-full items-center gap-1 px-0.5 text-left text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {sections.projectsOpen ? (
                  <ChevronDown size={14} className="shrink-0" />
                ) : (
                  <ChevronRight size={14} className="shrink-0" />
                )}
                {t('Active projects')}
              </button>
              {sections.projectsOpen && (
                <>
                  {activeProjects.length === 0 ? (
                    <p className="px-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {t('No active projects')}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {activeProjects.map((project) => (
                        <ProjectRow
                          key={project.id}
                          project={project}
                          tasks={tasks}
                          selected={selectedProjectId === project.id}
                          onSelect={() =>
                            onSelectProject(selectedProjectId === project.id ? null : project.id)
                          }
                          onOpenDetail={() => onOpenProjectDetail(project.id)}
                        />
                      ))}
                    </ul>
                  )}
                  {completedProjects.length > 0 && (
                    <div className="mt-3 border-t border-[var(--color-border)] pt-2">
                      <button
                        type="button"
                        onClick={() => setCompletedOpen((o) => !o)}
                        className="flex w-full items-center gap-1 px-0.5 text-left text-[11px] font-medium"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {completedOpen ? (
                          <ChevronDown size={14} className="shrink-0" />
                        ) : (
                          <ChevronRight size={14} className="shrink-0" />
                        )}
                        {t('Completed projects')} ({completedProjects.length})
                      </button>
                      {completedOpen && (
                        <ul className="mt-1 space-y-1">
                          {completedProjects.map((project) => (
                            <ProjectRow
                              key={project.id}
                              project={project}
                              tasks={tasks}
                              selected={selectedProjectId === project.id}
                              onSelect={() =>
                                onSelectProject(
                                  selectedProjectId === project.id ? null : project.id,
                                )
                              }
                              onOpenDetail={() => onOpenProjectDetail(project.id)}
                            />
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {showToday && (
            <section
              className={`mb-3 ${showProjects ? 'mt-3 border-t border-[var(--color-border)] pt-3' : ''}`}
            >
              <button
                type="button"
                onClick={() => updateSections({ todayOpen: !sections.todayOpen })}
                className="mb-1.5 flex w-full items-center gap-1 px-0.5 text-left text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {sections.todayOpen ? (
                  <ChevronDown size={14} className="shrink-0" />
                ) : (
                  <ChevronRight size={14} className="shrink-0" />
                )}
                {t("Today's tasks")}
              </button>
              {sections.todayOpen &&
                (todayTasks.length === 0 ? (
                  <p className="px-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t('Nothing planned today')}
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {todayTasks.map((task) => (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => onOpenTask(task.id)}
                          className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg)]"
                          style={{ color: 'var(--color-text)' }}
                        >
                          <span
                            className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2"
                            style={{
                              borderColor:
                                task.status === 'completed'
                                  ? 'var(--color-success, #22c55e)'
                                  : 'var(--color-accent)',
                              background:
                                task.status === 'completed'
                                  ? 'var(--color-success, #22c55e)'
                                  : 'transparent',
                            }}
                          >
                            {task.status === 'completed' && (
                              <Check size={8} className="text-white" strokeWidth={3} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{displayTaskTitle(task)}</span>
                          {task.ddl && (
                            <span
                              className="shrink-0 text-[10px] tabular-nums"
                              style={{ color: 'var(--color-text-tertiary)' }}
                            >
                              {formatDdlLabel(task.ddl)}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
            </section>
          )}

          {showTagsSection && (
            <section
              className={`${showProjects || showToday ? 'mt-3 border-t border-[var(--color-border)] pt-3' : ''}`}
            >
              <button
                type="button"
                onClick={() => updateSections({ tagsOpen: !sections.tagsOpen })}
                className="mb-1.5 flex w-full items-center gap-1 px-0.5 text-left text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {sections.tagsOpen ? (
                  <ChevronDown size={14} className="shrink-0" />
                ) : (
                  <ChevronRight size={14} className="shrink-0" />
                )}
                <Tag size={12} className="shrink-0 opacity-80" />
                {tStream('Recent tags')}
              </button>
              {sections.tagsOpen && (
                <div className="flex flex-wrap gap-1.5 px-0.5">
                  {topTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onTagFilter(tag)}
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-accent-soft)]"
                      style={{
                        background: 'var(--color-bg)',
                        color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </motion.aside>
  );
}

function ProjectRow({
  project,
  tasks,
  selected,
  onSelect,
  onOpenDetail,
}: {
  project: Task;
  tasks: Task[];
  selected: boolean;
  onSelect: () => void;
  onOpenDetail: () => void;
}) {
  const { t } = useTranslation('task');
  const { completed, total } = projectDirectChildProgress(project, tasks);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const directChildren = useMemo(() => {
    const ids = project.subtaskIds ?? [];
    const list = ids.map((id) => tasks.find((x) => x.id === id)).filter((x): x is Task => !!x);
    return [...list].sort((a, b) => {
      const ac = a.status === 'completed' ? 1 : 0;
      const bc = b.status === 'completed' ? 1 : 0;
      if (ac !== bc) return bc - ac;
      return 0;
    });
  }, [project.subtaskIds, tasks]);

  const previewChildren = selected ? directChildren : [];

  return (
    <li>
      <div className="flex items-stretch gap-0.5">
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 cursor-pointer rounded-lg px-2 py-1.5 text-left transition-colors"
          style={{
            background: selected ? 'var(--color-accent-soft)' : 'transparent',
            outline: selected ? '1px solid var(--color-accent)' : undefined,
            border: 'none',
            font: 'inherit',
          }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span
              className="min-w-0 flex-1 truncate text-[12px] font-medium"
              style={{ color: 'var(--color-text)' }}
              title={displayTaskTitle(project)}
            >
              {displayTaskTitle(project)}
            </span>
            <span
              className="shrink-0 text-[10px] tabular-nums"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {completed}/{total}
              {total > 0 ? ` (${pct}%)` : ''}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--color-border)' }}
            aria-hidden
          >
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${pct}%`,
                background: 'var(--color-accent)',
              }}
            />
          </div>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail();
          }}
          className="shrink-0 self-center rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg)]"
          style={{ color: 'var(--color-text-tertiary)' }}
          title={t('Open detail')}
          aria-label={t('Open detail')}
        >
          <ExternalLink size={14} />
        </button>
      </div>

      {previewChildren.length > 0 && (
        <ul className="ml-1 mt-1 space-y-0.5 border-l border-[var(--color-border)] pl-2">
          {previewChildren.map((child) => (
            <li
              key={child.id}
              className="flex items-center gap-1 text-[10px]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {child.status === 'completed' ? (
                <Check size={10} className="shrink-0 text-[var(--color-success,#22c55e)]" />
              ) : (
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full border border-[var(--color-text-tertiary)]" />
              )}
              <span className="truncate">{displayTaskTitle(child)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
