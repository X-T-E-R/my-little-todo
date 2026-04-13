import type { Task, TaskStatus } from '@my-little-todo/core';
import {
  collectProjectSubtree,
  daysUntil,
  displayTaskTitle,
  projectDescendantProgress,
  taskRoleIds,
  withTaskRoles,
} from '@my-little-todo/core';
import { type ToolSet, tool } from 'ai';
import { z } from 'zod';
import { searchStreamEntries } from '../storage/streamRepo';
import { useFocusSessionStore } from '../stores/focusSessionStore';
import { useRoleStore } from '../stores/roleStore';
import { useStreamStore } from '../stores/streamStore';
import { useTaskStore } from '../stores/taskStore';
import { useTimeAwarenessStore } from '../stores/timeAwarenessStore';
import type { PendingWrite, PendingWriteKind } from './types';

export interface AiToolsContext {
  confirmWrites: boolean;
  onPendingWrite?: (p: PendingWrite) => void;
}

function pendingJson(p: PendingWrite): string {
  return JSON.stringify({
    pending: true,
    pendingId: p.id,
    summary: p.summary,
    message:
      'Change is queued for user confirmation in the AI panel. Describe what will happen and ask the user to confirm there.',
  });
}

function queueWrite(
  ctx: AiToolsContext,
  kind: PendingWriteKind,
  summary: string,
  payload: Record<string, unknown>,
): string | null {
  if (!ctx.confirmWrites || !ctx.onPendingWrite) return null;
  const id = crypto.randomUUID();
  ctx.onPendingWrite({ id, kind, summary, payload });
  return pendingJson({ id, kind, summary, payload });
}

function parseIso(s?: string | null): Date | undefined {
  if (!s?.trim()) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function mapMcpStatus(s: string): TaskStatus {
  if (s === 'cancelled') return 'archived';
  return s as TaskStatus;
}

function taskMatchesTags(t: Task, tags: string[] | undefined): boolean {
  if (!tags?.length) return true;
  const set = new Set(t.tags ?? []);
  return tags.some((x) => set.has(x));
}

function sortTasks(list: Task[], sort: 'priority' | 'ddl' | 'created' | undefined): Task[] {
  const out = [...list];
  const s = sort ?? 'created';
  out.sort((a, b) => {
    if (s === 'priority') return (b.priority ?? 0) - (a.priority ?? 0);
    if (s === 'ddl') {
      const ad = a.ddl?.getTime() ?? Number.POSITIVE_INFINITY;
      const bd = b.ddl?.getTime() ?? Number.POSITIVE_INFINITY;
      return ad - bd;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  return out;
}

function serializeTaskSummary(t: Task) {
  return {
    id: t.id,
    title: displayTaskTitle(t),
    status: t.status,
    ddl: t.ddl?.toISOString() ?? null,
    ddl_type: t.ddlType ?? null,
    role: t.roleId ?? null,
    tags: t.tags,
    priority: t.priority ?? null,
    parent_id: t.parentId ?? null,
    task_type: t.taskType ?? 'task',
  };
}

function serializeTaskFull(t: Task, all: Task[]) {
  const sub = (t.subtaskIds ?? [])
    .map((id) => all.find((x) => x.id === id))
    .filter((x): x is Task => x !== undefined)
    .map(serializeTaskSummary);
  const parent = t.parentId ? all.find((x) => x.id === t.parentId) : undefined;
  return {
    ...serializeTaskSummary(t),
    body: t.body,
    description: t.description ?? null,
    subtasks: sub,
    parent: parent ? serializeTaskSummary(parent) : null,
  };
}

// ── Implementations (shared for tools + applyWriteAction) ─────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function per backend action; kept together for clarity
export async function applyWriteAction(
  kind: PendingWriteKind,
  payload: Record<string, unknown>,
): Promise<string> {
  switch (kind) {
    case 'create_task': {
      const p = payload as {
        title: string;
        body?: string;
        ddl?: string;
        ddl_type?: 'hard' | 'commitment' | 'soft';
        planned_at?: string;
        role?: string;
        tags?: string[];
        parent?: string;
        task_type?: 'task' | 'project';
      };
      let t = await useTaskStore.getState().createTask(p.title, {
        body: p.body,
        ddl: parseIso(p.ddl),
        ddlType: p.ddl_type,
        roleId: p.role,
        tags: p.tags,
        parentId: p.parent,
      });
      const planned = parseIso(p.planned_at);
      if (planned) {
        t = { ...t, plannedAt: planned };
      }
      if (p.task_type === 'project') {
        t = { ...t, taskType: 'project' };
      }
      if (planned || p.task_type === 'project') {
        await useTaskStore.getState().updateTask(t);
      }
      return JSON.stringify({ ok: true, task: serializeTaskSummary(t) });
    }
    case 'update_task': {
      const p = payload as {
        id: string;
        title?: string;
        body?: string;
        status?: string;
        ddl?: string | null;
        ddl_type?: 'hard' | 'commitment' | 'soft';
        planned_at?: string | null;
        role?: string | null;
        tags?: string[];
        note?: string;
        task_type?: 'task' | 'project';
      };
      const task = useTaskStore.getState().tasks.find((t) => t.id === p.id);
      if (!task) return JSON.stringify({ ok: false, error: 'Task not found' });
      let next: Task = { ...task };
      if (p.title !== undefined) next.title = p.title;
      if (p.body !== undefined) next.body = p.body;
      if (p.status !== undefined) next.status = mapMcpStatus(p.status);
      if (p.ddl !== undefined) next.ddl = p.ddl === null ? undefined : parseIso(p.ddl);
      if (p.ddl_type !== undefined) next.ddlType = p.ddl_type;
      if (p.planned_at !== undefined)
        next.plannedAt = p.planned_at === null ? undefined : parseIso(p.planned_at);
      if (p.role !== undefined) {
        next = { ...next, ...withTaskRoles(next, p.role ? [p.role] : []) };
      }
      if (p.tags !== undefined) next.tags = p.tags;
      if (p.task_type !== undefined) next.taskType = p.task_type;
      if (p.note?.trim()) {
        next.progressLogs = [
          ...(next.progressLogs ?? []),
          {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            content: p.note.trim(),
            source: 'manual' as const,
          },
        ];
      }
      await useTaskStore.getState().updateTask(next);
      return JSON.stringify({ ok: true, task: serializeTaskSummary(next) });
    }
    case 'delete_task': {
      const p = payload as { id: string };
      await useTaskStore.getState().deleteTask(p.id);
      return JSON.stringify({ ok: true, deleted: p.id });
    }
    case 'add_stream': {
      const p = payload as { content: string; role?: string };
      const entry = await useStreamStore.getState().addEntry(p.content, false, {
        roleId: p.role,
        entryType: 'spark',
      });
      return JSON.stringify({
        ok: true,
        entry: { id: entry.id, content: entry.content.slice(0, 200) },
      });
    }
    case 'update_stream_entry': {
      const p = payload as {
        id: string;
        content?: string;
        role?: string;
        entry_type?: 'spark' | 'task' | 'log';
        tags?: string[];
      };
      const entries = useStreamStore.getState().entries;
      const entry = entries.find((e) => e.id === p.id);
      if (!entry) return JSON.stringify({ ok: false, error: 'Stream entry not found' });
      const next = { ...entry };
      if (p.content !== undefined) next.content = p.content;
      if (p.role !== undefined) next.roleId = p.role || undefined;
      if (p.entry_type !== undefined) next.entryType = p.entry_type;
      if (p.tags !== undefined) next.tags = p.tags;
      await useStreamStore.getState().updateEntry(next);
      return JSON.stringify({ ok: true, entry: { id: next.id } });
    }
    case 'manage_role': {
      const p = payload as {
        action: 'create' | 'update' | 'delete';
        id?: string;
        name?: string;
        color?: string;
        icon?: string;
      };
      const rs = useRoleStore.getState();
      if (p.action === 'create') {
        if (!p.name?.trim()) return JSON.stringify({ ok: false, error: 'name required' });
        const role = await rs.createRole(p.name.trim(), { color: p.color, icon: p.icon });
        return JSON.stringify({ ok: true, role });
      }
      if (p.action === 'update') {
        if (!p.id) return JSON.stringify({ ok: false, error: 'id required' });
        await rs.updateRole(p.id, { name: p.name, color: p.color, icon: p.icon });
        return JSON.stringify({ ok: true, id: p.id });
      }
      if (p.action === 'delete') {
        if (!p.id) return JSON.stringify({ ok: false, error: 'id required' });
        await rs.deleteRole(p.id);
        return JSON.stringify({ ok: true, deleted: p.id });
      }
      return JSON.stringify({ ok: false, error: 'unknown action' });
    }
    default:
      return JSON.stringify({ ok: false, error: 'unknown kind' });
  }
}

export function buildAiTools(ctx: AiToolsContext): ToolSet {
  const tools: Record<string, unknown> = {};

  tools.get_overview = tool({
    description:
      '全局概览：任务计数、今日/进行中/逾期/即将到期、最近完成、角色、日程块、今日流预览、专注会话。首选入口。',
    inputSchema: z.object({}),
    execute: async () => {
      const tasks = useTaskStore.getState().tasks;
      const roles = useRoleStore.getState().roles;
      const blocks = useTimeAwarenessStore.getState().blocks;
      const focus = useFocusSessionStore.getState().session;
      const entries = useStreamStore.getState().entries;
      const now = Date.now();
      const todayKey = new Date().toISOString().slice(0, 10);

      const active = tasks.filter((t) => t.status !== 'completed' && t.status !== 'archived');
      const completedRecent = tasks
        .filter((t) => t.status === 'completed' && t.completedAt)
        .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))
        .slice(0, 5)
        .map(serializeTaskSummary);

      const today = active.filter((t) => t.status === 'today');
      const overdue = active.filter(
        (t) => t.ddl && t.ddl.getTime() < now && t.status !== 'completed',
      );
      const soon = active.filter((t) => {
        const ddl = t.ddl;
        if (!ddl) return false;
        const d = daysUntil(ddl);
        return d !== null && d <= 7 && d >= 0;
      });

      const streamToday = entries
        .filter((e) => e.timestamp.toISOString().slice(0, 10) === todayKey)
        .slice(0, 8);

      return JSON.stringify({
        task_counts: {
          total: tasks.length,
          active: active.length,
          today: today.length,
          overdue: overdue.length,
          due_soon_7d: soon.length,
        },
        roles: roles.map((r) => ({
          id: r.id,
          name: r.name,
          active_tasks: active.filter((t) => taskRoleIds(t).includes(r.id)).length,
        })),
        schedule_blocks: blocks.length,
        focus_session: focus
          ? {
              task_id: focus.taskId,
              started_at: focus.startedAt.toISOString(),
              locked: focus.locked,
            }
          : null,
        stream_preview_today: streamToday.map((e) => ({
          id: e.id,
          preview: e.content.slice(0, 120),
          time: e.timestamp.toISOString(),
        })),
        recently_completed: completedRecent,
      });
    },
  });

  tools.list_tasks = tool({
    description: '列出任务（轻量摘要，无正文）。支持分页、父任务子任务、按标签与排序。',
    inputSchema: z.object({
      status: z.enum(['inbox', 'active', 'today', 'completed', 'archived', 'cancelled']).optional(),
      role: z.string().optional(),
      parent: z.string().optional(),
      tags: z.array(z.string()).optional(),
      sort: z.enum(['priority', 'ddl', 'created']).optional(),
      offset: z.number().int().optional(),
      limit: z.number().int().optional(),
    }),
    execute: async (params) => {
      let list = [...useTaskStore.getState().tasks];
      if (params.status) {
        const st = mapMcpStatus(params.status);
        list = list.filter((t) => t.status === st);
      }
      if (params.role) {
        const role = params.role;
        list = list.filter((t) => taskRoleIds(t).includes(role));
      }
      if (params.parent) {
        list = list.filter((t) => t.parentId === params.parent);
      }
      if (params.tags?.length) {
        list = list.filter((t) => taskMatchesTags(t, params.tags));
      }
      list = sortTasks(list, params.sort);
      const offset = Math.max(0, params.offset ?? 0);
      const limit = Math.min(50, Math.max(1, params.limit ?? 20));
      const slice = list.slice(offset, offset + limit);
      return JSON.stringify({
        tasks: slice.map(serializeTaskSummary),
        total: list.length,
        offset,
        limit,
      });
    },
  });

  tools.get_task = tool({
    description: '单个任务完整信息（含正文）。含子任务与父任务摘要。',
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => {
      const all = useTaskStore.getState().tasks;
      const t = all.find((x) => x.id === id);
      if (!t) return JSON.stringify({ error: 'not found' });
      return JSON.stringify(serializeTaskFull(t, all));
    },
  });

  tools.list_projects = tool({
    description:
      '列出标记为「项目」的任务（非 completed/archived），可选按角色筛选；含子树完成进度。',
    inputSchema: z.object({ role: z.string().optional() }),
    execute: async (params) => {
      const all = useTaskStore.getState().tasks;
      let projects = all.filter(
        (t) => t.taskType === 'project' && t.status !== 'completed' && t.status !== 'archived',
      );
      if (params.role) {
        const role = params.role;
        projects = projects.filter((t) => taskRoleIds(t).includes(role));
      }
      return JSON.stringify({
        projects: projects.map((p) => {
          const prog = projectDescendantProgress(p, all);
          return {
            ...serializeTaskSummary(p),
            progress: prog.total ? prog.completed / prog.total : 0,
            completed: prog.completed,
            total: prog.total,
          };
        }),
      });
    },
  });

  tools.get_project_progress = tool({
    description: '单个项目任务的子树完成进度（统计所有后代任务，不含根项目自身）。',
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => {
      const all = useTaskStore.getState().tasks;
      const p = all.find((t) => t.id === id);
      if (!p || p.taskType !== 'project') return JSON.stringify({ error: 'not a project' });
      const prog = projectDescendantProgress(p, all);
      const subtree = collectProjectSubtree(p, all);
      return JSON.stringify({
        project_id: p.id,
        title: displayTaskTitle(p),
        completed: prog.completed,
        total: prog.total,
        ratio: prog.total ? prog.completed / prog.total : 0,
        descendants: subtree.filter((t) => t.id !== p.id).map(serializeTaskSummary),
      });
    },
  });

  tools.get_roles = tool({
    description: '角色列表及统计（活跃数、今日/逾期）。',
    inputSchema: z.object({}),
    execute: async () => {
      const roles = useRoleStore.getState().roles;
      const tasks = useTaskStore.getState().tasks;
      const now = Date.now();
      return JSON.stringify({
        roles: roles.map((r) => {
          const active = tasks.filter(
            (t) =>
              t.status !== 'completed' && t.status !== 'archived' && taskRoleIds(t).includes(r.id),
          );
          const today = active.filter((t) => t.status === 'today');
          const overdue = active.filter((t) => t.ddl && t.ddl.getTime() < now);
          return {
            id: r.id,
            name: r.name,
            color: r.color,
            active_count: active.length,
            today_count: today.length,
            overdue_count: overdue.length,
          };
        }),
      });
    },
  });

  tools.search = tool({
    description: '在任务 title/body 与流 content 上子串搜索。',
    inputSchema: z.object({
      query: z.string(),
      scope: z.enum(['all', 'tasks', 'stream']).optional(),
      limit: z.number().int().optional(),
    }),
    execute: async (params) => {
      const q = params.query.trim().toLowerCase();
      if (!q) return JSON.stringify({ tasks: [], stream: [] });
      const limit = Math.min(100, Math.max(1, params.limit ?? 10));
      const scope = params.scope ?? 'all';
      const out: { tasks: unknown[]; stream: unknown[] } = { tasks: [], stream: [] };

      if (scope === 'all' || scope === 'tasks') {
        const tasks = useTaskStore
          .getState()
          .tasks.filter(
            (t) =>
              t.title.toLowerCase().includes(q) ||
              (t.body?.toLowerCase().includes(q) ?? false) ||
              (t.description?.toLowerCase().includes(q) ?? false),
          )
          .slice(0, limit)
          .map(serializeTaskSummary);
        out.tasks = tasks;
      }
      if (scope === 'all' || scope === 'stream') {
        const stream = await searchStreamEntries(params.query, limit);
        out.stream = stream.map((e) => ({
          id: e.id,
          preview: e.content.slice(0, 120),
          time: e.timestamp.toISOString(),
        }));
      }
      return JSON.stringify(out);
    },
  });

  tools.list_stream = tool({
    description: '列出流记录，支持分页与按角色/类型过滤。',
    inputSchema: z.object({
      days: z.number().int().optional(),
      limit: z.number().int().optional(),
      offset: z.number().int().optional(),
      role: z.string().optional(),
      type: z.enum(['spark', 'task', 'log']).optional(),
    }),
    execute: async (params) => {
      let list = [...useStreamStore.getState().entries];
      const days = params.days ?? 7;
      const cutoff = Date.now() - days * 86400000;
      list = list.filter((e) => e.timestamp.getTime() >= cutoff);
      if (params.role) {
        list = list.filter((e) => e.roleId === params.role);
      }
      if (params.type) {
        list = list.filter((e) => e.entryType === params.type);
      }
      list.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      const offset = Math.max(0, params.offset ?? 0);
      const limit = Math.min(50, Math.max(1, params.limit ?? 20));
      const slice = list.slice(offset, offset + limit);
      return JSON.stringify({
        entries: slice.map((e) => ({
          id: e.id,
          preview: e.content.slice(0, 200),
          time: e.timestamp.toISOString(),
          entry_type: e.entryType,
          role: e.roleId ?? null,
        })),
        total: list.length,
      });
    },
  });

  tools.create_task = tool({
    description: '创建任务，默认 inbox。ddl_type: hard/commitment/soft。',
    inputSchema: z.object({
      title: z.string(),
      body: z.string().optional(),
      ddl: z.string().optional(),
      ddl_type: z.enum(['hard', 'commitment', 'soft']).optional(),
      planned_at: z.string().optional(),
      role: z.string().optional(),
      tags: z.array(z.string()).optional(),
      parent: z.string().optional(),
      task_type: z.enum(['task', 'project']).optional(),
    }),
    execute: async (params) => {
      const summary = `Create task: ${params.title.slice(0, 80)}`;
      const queued = queueWrite(
        ctx,
        'create_task',
        summary,
        params as unknown as Record<string, unknown>,
      );
      if (queued) return queued;
      return applyWriteAction('create_task', params as unknown as Record<string, unknown>);
    },
  });

  tools.update_task = tool({
    description: '更新任务。status=completed 完成；可附 note。',
    inputSchema: z.object({
      id: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      status: z.enum(['inbox', 'active', 'today', 'completed', 'archived', 'cancelled']).optional(),
      ddl: z.string().nullable().optional(),
      ddl_type: z.enum(['hard', 'commitment', 'soft']).optional(),
      planned_at: z.string().nullable().optional(),
      role: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      note: z.string().optional(),
      task_type: z.enum(['task', 'project']).optional(),
    }),
    execute: async (params) => {
      const summary = `Update task ${params.id}`;
      const queued = queueWrite(
        ctx,
        'update_task',
        summary,
        params as unknown as Record<string, unknown>,
      );
      if (queued) return queued;
      return applyWriteAction('update_task', params as unknown as Record<string, unknown>);
    },
  });

  tools.delete_task = tool({
    description: '删除任务。',
    inputSchema: z.object({ id: z.string() }),
    execute: async (params) => {
      const summary = `Delete task ${params.id}`;
      const queued = queueWrite(
        ctx,
        'delete_task',
        summary,
        params as unknown as Record<string, unknown>,
      );
      if (queued) return queued;
      return applyWriteAction('delete_task', params as unknown as Record<string, unknown>);
    },
  });

  tools.add_stream = tool({
    description: '添加流记录。',
    inputSchema: z.object({
      content: z.string(),
      role: z.string().optional(),
    }),
    execute: async (params) => {
      const summary = `Add stream entry (${params.content.slice(0, 60)}…)`;
      const queued = queueWrite(
        ctx,
        'add_stream',
        summary,
        params as unknown as Record<string, unknown>,
      );
      if (queued) return queued;
      return applyWriteAction('add_stream', params as unknown as Record<string, unknown>);
    },
  });

  tools.update_stream_entry = tool({
    description: '更新流记录内容、角色或类型。',
    inputSchema: z.object({
      id: z.string(),
      content: z.string().optional(),
      role: z.string().optional(),
      entry_type: z.enum(['spark', 'task', 'log']).optional(),
      tags: z.array(z.string()).optional(),
    }),
    execute: async (params) => {
      const summary = `Update stream entry ${params.id}`;
      const queued = queueWrite(
        ctx,
        'update_stream_entry',
        summary,
        params as unknown as Record<string, unknown>,
      );
      if (queued) return queued;
      return applyWriteAction('update_stream_entry', params as unknown as Record<string, unknown>);
    },
  });

  tools.manage_role = tool({
    description: '创建、更新或删除角色。',
    inputSchema: z.object({
      action: z.enum(['create', 'update', 'delete']),
      id: z.string().optional(),
      name: z.string().optional(),
      color: z.string().optional(),
      icon: z.string().optional(),
    }),
    execute: async (params) => {
      const summary = `Role ${params.action}${params.id ? ` (${params.id})` : ''}`;
      const queued = queueWrite(
        ctx,
        'manage_role',
        summary,
        params as unknown as Record<string, unknown>,
      );
      if (queued) return queued;
      return applyWriteAction('manage_role', params as unknown as Record<string, unknown>);
    },
  });

  return tools as ToolSet;
}
