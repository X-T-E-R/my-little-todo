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
  const resumeCard = parseValue<WorkThread['resumeCard']>(
    record.resume_card ?? record.resumeCard,
    undefined as never,
  );
  const thread: WorkThread = {
    id: String(record.id),
    title: String(record.title ?? ''),
    bodyMarkdown: String(
      record.body_markdown ??
        record.bodyMarkdown ??
        record.root_markdown ??
        record.rootMarkdown ??
        record.doc_markdown ??
        record.docMarkdown ??
        '',
    ),
    resume:
      record.resume_text != null
        ? String(record.resume_text)
        : record.resumeText != null
          ? String(record.resumeText)
          : resumeCard?.nextStep
            ? String(resumeCard.nextStep)
            : undefined,
    pause: parseValue<WorkThread['pause']>(record.pause_json ?? record.pauseJson, undefined as never),
    blocks: parseValue<WorkThread['blocks']>(record.blocks_json ?? record.blocksJson, []),
    mission: String(record.mission ?? ''),
    status: String(record.status ?? 'ready') as WorkThread['status'],
    lane: String(record.lane ?? 'general') as WorkThread['lane'],
    roleId: record.role_id != null ? String(record.role_id) : record.roleId != null ? String(record.roleId) : undefined,
    rootMarkdown: String(record.root_markdown ?? record.rootMarkdown ?? record.doc_markdown ?? record.docMarkdown ?? ''),
    explorationMarkdown: String(record.exploration_markdown ?? record.explorationMarkdown ?? ''),
    docMarkdown: String(record.doc_markdown ?? record.docMarkdown ?? ''),
    contextItems: parseValue<WorkThread['contextItems']>(record.context_items ?? record.contextItems, []),
    intents: parseValue<WorkThread['intents']>(record.intents, []),
    sparkContainers: parseValue<WorkThread['sparkContainers']>(
      record.spark_containers ?? record.sparkContainers,
      [],
    ),
    nextActions: parseValue<WorkThread['nextActions']>(record.next_actions ?? record.nextActions, []),
    resumeCard,
    workingSet: parseValue<WorkThread['workingSet']>(record.working_set ?? record.workingSet, []),
    waitingFor: parseValue<WorkThread['waitingFor']>(record.waiting_for ?? record.waitingFor, []),
    interrupts: parseValue<WorkThread['interrupts']>(record.interrupts, []),
    explorationBlocks: parseValue<WorkThread['explorationBlocks']>(
      record.exploration_blocks ?? record.explorationBlocks,
      [],
    ),
    inlineAnchors: parseValue<WorkThread['inlineAnchors']>(
      record.inline_anchors ?? record.inlineAnchors,
      [],
    ),
    schedulerMeta: parseValue<WorkThread['schedulerMeta']>(record.scheduler_meta ?? record.schedulerMeta, {}),
    syncMeta: parseValue<WorkThread['syncMeta']>(record.sync_meta ?? record.syncMeta, {
      mode: 'internal',
    }),
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
    body_markdown: thread.bodyMarkdown,
    resume_text: thread.resume ?? null,
    pause_json: thread.pause ? JSON.stringify(thread.pause) : null,
    blocks_json: JSON.stringify(thread.blocks),
    mission: thread.mission,
    status: thread.status,
    lane: thread.lane,
    role_id: thread.roleId ?? null,
    root_markdown: thread.rootMarkdown,
    exploration_markdown: thread.explorationMarkdown,
    doc_markdown: thread.docMarkdown,
    context_items: JSON.stringify(thread.contextItems),
    intents: JSON.stringify(thread.intents),
    spark_containers: JSON.stringify(thread.sparkContainers),
    next_actions: JSON.stringify(thread.nextActions),
    resume_card: JSON.stringify(thread.resumeCard),
    working_set: JSON.stringify(thread.workingSet),
    waiting_for: JSON.stringify(thread.waitingFor),
    interrupts: JSON.stringify(thread.interrupts),
    exploration_blocks: JSON.stringify(thread.explorationBlocks),
    inline_anchors: JSON.stringify(thread.inlineAnchors),
    scheduler_meta: JSON.stringify(thread.schedulerMeta),
    sync_meta: JSON.stringify(thread.syncMeta ?? { mode: 'internal' }),
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
