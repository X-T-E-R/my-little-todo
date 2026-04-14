import type { StreamEntry, Task } from '@my-little-todo/core';
import { displayTaskTitle } from '@my-little-todo/core';

export type MaterialSidebarSectionId =
  | 'ddlSoon'
  | 'activeTasks'
  | 'projects'
  | 'recentStream';

export interface MaterialSidebarItem {
  id: string;
  kind: 'task' | 'project' | 'stream';
  title: string;
  subtitle?: string;
  task?: Task;
  streamEntry?: StreamEntry;
}

export interface MaterialSidebarSection {
  id: MaterialSidebarSectionId;
  items: MaterialSidebarItem[];
}

function matchesRole(itemRoleId: string | undefined, currentRoleId: string | null): boolean {
  if (!currentRoleId) return true;
  return itemRoleId === currentRoleId;
}

function matchesTask(task: Task, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [displayTaskTitle(task), task.body ?? '', task.description ?? '']
    .join(' ')
    .toLowerCase();
  return haystack.includes(normalized);
}

function matchesStream(entry: StreamEntry, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return entry.content.toLowerCase().includes(normalized);
}

function daysUntilFrom(now: Date, target: Date): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(target);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function buildMaterialSidebarSections({
  tasks,
  streamEntries,
  currentRoleId,
  query,
  now = new Date(),
}: {
  tasks: Task[];
  streamEntries: StreamEntry[];
  currentRoleId: string | null;
  query: string;
  now?: Date;
}): MaterialSidebarSection[] {
  const visibleTasks = tasks.filter(
    (task) =>
      task.status !== 'archived' &&
      task.status !== 'completed' &&
      matchesRole(task.roleId, currentRoleId),
  );
  const visibleStream = streamEntries.filter((entry) => matchesRole(entry.roleId, currentRoleId));

  const ddlSoon: MaterialSidebarItem[] = visibleTasks
    .filter((task) => task.taskType !== 'project')
    .filter((task) => task.ddl)
    .filter((task) => {
      const days = daysUntilFrom(now, task.ddl as Date);
      return days >= 0 && days <= 7;
    })
    .filter((task) => matchesTask(task, query))
    .sort((a, b) => (a.ddl?.getTime() ?? 0) - (b.ddl?.getTime() ?? 0))
    .slice(0, 8)
    .map((task) => ({
      id: task.id,
      kind: 'task' as const,
      title: displayTaskTitle(task),
      subtitle: task.ddl?.toLocaleDateString(),
      task,
    }));

  const activeTasks: MaterialSidebarItem[] = visibleTasks
    .filter((task) => task.taskType !== 'project')
    .filter((task) => !task.ddl)
    .filter((task) => matchesTask(task, query))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 16)
    .map((task) => ({
      id: task.id,
      kind: 'task' as const,
      title: displayTaskTitle(task),
      subtitle: task.description || task.body || undefined,
      task,
    }));

  const projects: MaterialSidebarItem[] = visibleTasks
    .filter((task) => task.taskType === 'project')
    .filter((task) => matchesTask(task, query))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 10)
    .map((task) => ({
      id: task.id,
      kind: 'project' as const,
      title: displayTaskTitle(task),
      subtitle: task.description || task.body || undefined,
      task,
    }));

  const recentStream: MaterialSidebarItem[] = visibleStream
    .filter((entry) => matchesStream(entry, query))
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 8)
    .map((entry) => ({
      id: entry.id,
      kind: 'stream' as const,
      title: entry.content.replace(/\s+/g, ' ').trim().slice(0, 64) || 'Stream note',
      subtitle: entry.content.replace(/\s+/g, ' ').trim().slice(0, 120) || undefined,
      streamEntry: entry,
    }));

  const sections: MaterialSidebarSection[] = [
    { id: 'ddlSoon', items: ddlSoon },
    { id: 'activeTasks', items: activeTasks },
    { id: 'projects', items: projects },
    { id: 'recentStream', items: recentStream },
  ];
  return sections.filter((section) => section.items.length > 0);
}
