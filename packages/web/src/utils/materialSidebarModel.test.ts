import type { StreamEntry, Task } from '@my-little-todo/core';
import { describe, expect, it } from 'vitest';
import { buildMaterialSidebarSections } from './materialSidebarModel';

function createTask(partial: Partial<Task> & Pick<Task, 'id'>): Task {
  const now = new Date('2026-04-14T10:00:00+08:00');
  return {
    id: partial.id,
    title: partial.title ?? '',
    body: partial.body ?? '',
    titleCustomized: partial.titleCustomized ?? false,
    status: partial.status ?? 'active',
    taskType: partial.taskType ?? 'task',
    roleId: partial.roleId,
    roleIds: partial.roleIds ?? [],
    updatedAt: partial.updatedAt ?? now,
    createdAt: partial.createdAt ?? now,
    ddl: partial.ddl,
    priority: partial.priority ?? 5,
    tags: partial.tags ?? [],
    parentId: partial.parentId,
    subtaskIds: partial.subtaskIds ?? [],
    resources: partial.resources ?? [],
    reminders: partial.reminders ?? [],
    submissions: partial.submissions ?? [],
    postponements: partial.postponements ?? [],
    statusHistory: partial.statusHistory ?? [],
    completedAt: partial.completedAt,
    description: partial.description,
  };
}

function createStreamEntry(partial: Partial<StreamEntry> & Pick<StreamEntry, 'id' | 'content'>): StreamEntry {
  return {
    id: partial.id,
    content: partial.content,
    timestamp: partial.timestamp ?? new Date('2026-04-14T10:00:00+08:00'),
    entryType: partial.entryType ?? 'spark',
    roleId: partial.roleId,
    extractedTaskId: partial.extractedTaskId,
    tags: partial.tags ?? [],
    attachments: partial.attachments ?? [],
  };
}

describe('buildMaterialSidebarSections', () => {
  it('keeps due-soon tasks, active tasks, projects, and recent stream notes in separate sections', () => {
    const tasks = [
      createTask({
        id: 'soon-task',
        body: 'Need this soon',
        ddl: new Date('2026-04-16T09:00:00+08:00'),
        roleId: 'dev',
      }),
      createTask({
        id: 'active-task',
        body: 'General task body',
        roleId: 'dev',
      }),
      createTask({
        id: 'project-task',
        body: 'Project body',
        roleId: 'dev',
        taskType: 'project',
      }),
    ];

    const streamEntries = [
      createStreamEntry({
        id: 'stream-1',
        content: 'Recent note about a broken layout',
        roleId: 'dev',
      }),
    ];

    const sections = buildMaterialSidebarSections({
      tasks,
      streamEntries,
      currentRoleId: 'dev',
      query: '',
    });

    expect(sections.map((section) => section.id)).toEqual([
      'ddlSoon',
      'activeTasks',
      'projects',
      'recentStream',
    ]);
    expect(sections[0]?.items[0]?.id).toBe('soon-task');
    expect(sections[1]?.items[0]?.id).toBe('active-task');
    expect(sections[2]?.items[0]?.id).toBe('project-task');
    expect(sections[3]?.items[0]?.id).toBe('stream-1');
  });

  it('filters by query across task display text and stream text', () => {
    const sections = buildMaterialSidebarSections({
      tasks: [
        createTask({
          id: 'task-match',
          body: 'Need to draft runtime summary',
        }),
        createTask({
          id: 'task-miss',
          body: 'Unrelated body',
        }),
      ],
      streamEntries: [
        createStreamEntry({
          id: 'stream-match',
          content: 'Runtime shell idea',
        }),
      ],
      currentRoleId: null,
      query: 'runtime',
    });

    expect(sections.flatMap((section) => section.items.map((item) => item.id))).toEqual([
      'task-match',
      'stream-match',
    ]);
  });

  it('removes empty sections after filtering', () => {
    const sections = buildMaterialSidebarSections({
      tasks: [
        createTask({
          id: 'task-miss',
          body: 'No match here',
        }),
      ],
      streamEntries: [],
      currentRoleId: null,
      query: 'needle',
    });

    expect(sections).toEqual([]);
  });
});
