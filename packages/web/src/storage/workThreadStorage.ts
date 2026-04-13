import type { WorkThread, WorkThreadEvent } from '@my-little-todo/core';
import { ensureWorkThreadRuntime } from '@my-little-todo/core';

function parseValue<T>(value: unknown, fallback: T): T {
  if (value == null || String(value).trim() === '') return fallback;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

export function deserializeWorkThread(raw: unknown): WorkThread {
  const record = raw as Record<string, unknown>;
  const thread: WorkThread = {
    id: String(record.id),
    title: String(record.title ?? ''),
    mission: String(record.mission ?? ''),
    status: String(record.status ?? 'ready') as WorkThread['status'],
    lane: String(record.lane ?? 'general') as WorkThread['lane'],
    roleId: record.role_id != null ? String(record.role_id) : record.roleId != null ? String(record.roleId) : undefined,
    docMarkdown: String(record.doc_markdown ?? record.docMarkdown ?? ''),
    contextItems: parseValue<WorkThread['contextItems']>(record.context_items ?? record.contextItems, []),
    nextActions: parseValue<WorkThread['nextActions']>(record.next_actions ?? record.nextActions, []),
    resumeCard: parseValue<WorkThread['resumeCard']>(record.resume_card ?? record.resumeCard, undefined as never),
    workingSet: parseValue<WorkThread['workingSet']>(record.working_set ?? record.workingSet, []),
    waitingFor: parseValue<WorkThread['waitingFor']>(record.waiting_for ?? record.waitingFor, []),
    interrupts: parseValue<WorkThread['interrupts']>(record.interrupts, []),
    schedulerMeta: parseValue<WorkThread['schedulerMeta']>(record.scheduler_meta ?? record.schedulerMeta, {}),
    suggestions: parseValue<WorkThread['suggestions']>(record.suggestions, []),
    createdAt: Number(record.created_at ?? record.createdAt ?? Date.now()),
    updatedAt: Number(record.updated_at ?? record.updatedAt ?? Date.now()),
  };
  return ensureWorkThreadRuntime(thread);
}

export function serializeWorkThread(thread: WorkThread) {
  return {
    id: thread.id,
    title: thread.title,
    mission: thread.mission,
    status: thread.status,
    lane: thread.lane,
    role_id: thread.roleId ?? null,
    doc_markdown: thread.docMarkdown,
    context_items: JSON.stringify(thread.contextItems),
    next_actions: JSON.stringify(thread.nextActions),
    resume_card: JSON.stringify(thread.resumeCard),
    working_set: JSON.stringify(thread.workingSet),
    waiting_for: JSON.stringify(thread.waitingFor),
    interrupts: JSON.stringify(thread.interrupts),
    scheduler_meta: JSON.stringify(thread.schedulerMeta),
    suggestions: thread.suggestions != null ? JSON.stringify(thread.suggestions) : null,
    created_at: thread.createdAt,
    updated_at: thread.updatedAt,
  };
}

export function deserializeWorkThreadEvent(raw: unknown): WorkThreadEvent {
  const record = raw as Record<string, unknown>;
  return {
    id: String(record.id),
    threadId: String(record.thread_id ?? record.threadId),
    type: String(record.type) as WorkThreadEvent['type'],
    actor: String(record.actor) as WorkThreadEvent['actor'],
    title: String(record.title ?? ''),
    detailMarkdown:
      record.detail_markdown != null
        ? String(record.detail_markdown)
        : record.detailMarkdown != null
          ? String(record.detailMarkdown)
          : undefined,
    payload: parseValue<WorkThreadEvent['payload']>(record.payload, undefined),
    createdAt: Number(record.created_at ?? record.createdAt ?? Date.now()),
  };
}
