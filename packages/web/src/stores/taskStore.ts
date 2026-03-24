import type { Task, TaskStatus } from '@my-little-todo/core';
import { daysUntil } from '@my-little-todo/core';
import { create } from 'zustand';
import i18n from '../locales';
import { getCachedTasks, setCachedTasks } from '../storage/cacheLayer';
import {
  addSubtask as addSubtaskInRepo,
  createTask as createTaskInRepo,
  deleteTask as deleteTaskInRepo,
  extractSubtask as extractSubtaskInRepo,
  loadAllTasks,
  postponeTask as postponeInRepo,
  saveTask,
  submitTask as submitInRepo,
  updateTaskStatus as updateStatusInRepo,
} from '../storage/taskRepo';

interface TaskState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  selectedTaskId: string | null;

  load: () => Promise<void>;
  createTask: (
    title: string,
    opts?: {
      description?: string;
      ddl?: Date;
      ddlType?: Task['ddlType'];
      tags?: string[];
      sourceStreamId?: string;
      roleId?: string;
      body?: string;
      parentId?: string;
    },
  ) => Promise<Task>;
  updateStatus: (id: string, status: TaskStatus) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  postponeTask: (id: string, reason: string, newDate: Date) => Promise<void>;
  submitTask: (id: string, note: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  addSubtask: (parentId: string, title: string) => Promise<Task | null>;
  extractSubtask: (subtaskId: string) => Promise<void>;
  selectTask: (id: string | null) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  selectedTaskId: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const cached = await getCachedTasks();
      if (cached && get().tasks.length === 0) {
        set({ tasks: cached as Task[], loading: false });
      }
      const tasks = await loadAllTasks();
      set({ tasks, loading: false });
      setCachedTasks(tasks);
    } catch (e) {
      if (get().tasks.length === 0) {
        set({ error: String(e), loading: false });
      } else {
        set({ loading: false });
      }
    }
  },

  createTask: async (title, opts) => {
    const task = await createTaskInRepo(title, opts);
    set((state) => ({ tasks: [...state.tasks, task] }));
    return task;
  },

  updateStatus: async (id, status) => {
    const prev = get().tasks;
    const task = prev.find((t) => t.id === id);
    if (!task) return;

    const optimistic = {
      ...task,
      status,
      ...(status === 'completed' ? { completedAt: new Date() } : {}),
    } as Task;
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? optimistic : t)),
    }));

    try {
      const updated = await updateStatusInRepo(id, status);
      if (updated) {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? updated : t)),
        }));
      }
    } catch {
      set({ tasks: prev });
    }
  },

  updateTask: async (task) => {
    await saveTask(task);
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    }));
  },

  postponeTask: async (id, reason, newDate) => {
    const updated = await postponeInRepo(id, reason, newDate);
    if (!updated) return;
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? updated : t)),
    }));
  },

  submitTask: async (id, note) => {
    const updated = await submitInRepo(id, note);
    if (!updated) return;
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? updated : t)),
    }));
  },

  deleteTask: async (id) => {
    const prev = get().tasks;
    const prevSelectedId = get().selectedTaskId;
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
    }));

    try {
      await deleteTaskInRepo(id);
    } catch {
      set({ tasks: prev, selectedTaskId: prevSelectedId });
    }
  },

  addSubtask: async (parentId, title) => {
    const child = await addSubtaskInRepo(parentId, title);
    if (!child) return null;
    set((state) => ({
      tasks: [
        ...state.tasks.map((t) =>
          t.id === parentId ? { ...t, subtaskIds: [...(t.subtaskIds ?? []), child.id] } : t,
        ),
        child,
      ],
    }));
    return child;
  },

  extractSubtask: async (subtaskId) => {
    const child = get().tasks.find((t) => t.id === subtaskId);
    if (!child?.parentId) return;
    const parentId = child.parentId;

    await extractSubtaskInRepo(subtaskId);

    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id === parentId) {
          return { ...t, subtaskIds: (t.subtaskIds ?? []).filter((id) => id !== subtaskId) };
        }
        if (t.id === subtaskId) {
          return { ...t, parentId: undefined };
        }
        return t;
      }),
    }));
  },

  selectTask: (id) => set({ selectedTaskId: id }),
}));

/** Top-level active tasks only (excludes subtasks and malformed entries). */
export function getActiveTasks(tasks: Task[]): Task[] {
  return tasks.filter(
    (t) =>
      t.id &&
      t.title &&
      !t.parentId &&
      (t.status === 'active' || t.status === 'today' || t.status === 'inbox'),
  );
}

export function getTasksWithDdl(tasks: Task[]): Task[] {
  return getActiveTasks(tasks)
    .filter((t) => t.ddl)
    .sort((a, b) => {
      const ta = a.ddl?.getTime() ?? 0;
      const tb = b.ddl?.getTime() ?? 0;
      return ta - tb;
    });
}

export function getTasksWithoutDdl(tasks: Task[]): Task[] {
  return getActiveTasks(tasks).filter((t) => !t.ddl);
}

export function getCompletedTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.parentId && t.status === 'completed')
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
}

function urgencyScoreForDays(days: number): number {
  if (days <= 0) return 100;
  if (days <= 1) return 80;
  if (days <= 3) return 60;
  if (days <= 7) return 30;
  return 10;
}

function ddlTypeBonus(ddlType: Task['ddlType']): number {
  if (ddlType === 'hard') return 20;
  if (ddlType === 'commitment') return 10;
  return 0;
}

function recommendationScore(task: Task, now: Date): number {
  let score = 0;
  if (task.ddl) {
    const days = daysUntil(task.ddl, now);
    score += urgencyScoreForDays(days);
    score += ddlTypeBonus(task.ddlType);
  }
  if (task.priority) score += task.priority;
  return score;
}

export function pickRecommendation(tasks: Task[]): Task | null {
  const active = getActiveTasks(tasks);
  if (active.length === 0) return null;

  const now = new Date();
  const scored = active.map((task) => ({
    task,
    score: recommendationScore(task, now),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.task ?? null;
}

export function pickRandom(tasks: Task[]): Task | null {
  const active = getActiveTasks(tasks);
  if (active.length === 0) return null;
  const idx = Math.floor(Math.random() * active.length);
  return active[idx] ?? null;
}

export function formatDdlLabel(ddl: Date): string {
  const now = new Date();
  const days = daysUntil(ddl, now);
  const dayKeys = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
  const dayOfWeek = `${i18n.t('dates.weekday_prefix', { ns: 'common' })}${i18n.t(`dates.${dayKeys[ddl.getDay()]}`, { ns: 'common' })}`;

  if (days <= 0) return i18n.t('dates.Expired ({{dayOfWeek}})', { ns: 'common', dayOfWeek });
  if (days === 1) return i18n.t('dates.Tomorrow', { ns: 'common' });

  const hours = Math.floor(((ddl.getTime() - now.getTime()) % 86400000) / 3600000);
  if (days <= 7) {
    return hours > 0
      ? i18n.t('dates.{{dayOfWeek}} ({{days}} days and {{hours}} hours left)', {
          ns: 'common',
          dayOfWeek,
          days,
          hours,
        })
      : i18n.t('dates.{{dayOfWeek}} ({{days}} days left)', { ns: 'common', dayOfWeek, days });
  }
  return i18n.t('dates.{{month}}/{{date}} ({{days}} days left)', {
    ns: 'common',
    month: ddl.getMonth() + 1,
    date: ddl.getDate(),
    days,
  });
}
