import type { Task } from '../models/task.js';
import type {
  WorkThread,
  WorkThreadBlock,
  WorkThreadContextItem,
  WorkThreadLane,
  WorkThreadPause,
  WorkThreadResumeCard,
  WorkThreadSchedulerPolicy,
  WorkThreadStatus,
  WorkThreadSyncMeta,
  WorkThreadWorkingSetItem,
} from '../models/work-thread.js';

export const DEFAULT_WORK_THREAD_SCHEDULER_POLICY: WorkThreadSchedulerPolicy = 'coach';
export const WORK_THREAD_WORKING_SET_LIMIT = 5;

export interface CreateWorkThreadOptions {
  title?: string;
  mission?: string;
  lane?: WorkThreadLane;
  roleId?: string;
  docMarkdown?: string;
  status?: WorkThreadStatus;
  now?: number;
}

export interface WorkThreadRecommendation {
  thread: WorkThread;
  reason: string;
  score: number;
}

function normalizeString(value: string | undefined): string {
  return value?.trim() ?? '';
}

function normalizePause(pause: WorkThreadPause | undefined): WorkThreadPause | undefined {
  if (!pause) return undefined;
  const reason = normalizeString(pause.reason);
  if (!reason) return undefined;
  const normalizedPause: WorkThreadPause = {
    reason,
    updatedAt: Number(pause.updatedAt ?? Date.now()) || Date.now(),
  };
  const thenText = normalizeString(pause.then) || undefined;
  if (thenText) {
    // biome-ignore lint/suspicious/noThenProperty: `pause.then` is a persisted domain field.
    normalizedPause.then = thenText;
  }
  return normalizedPause;
}

function normalizeLegacyStatus(status: WorkThreadStatus | undefined): WorkThreadStatus {
  switch (status) {
    case 'running':
    case 'ready':
      return 'active';
    case 'waiting':
    case 'blocked':
    case 'sleeping':
      return 'paused';
    case 'done':
    case 'archived':
    case 'active':
    case 'paused':
      return status;
    default:
      return 'active';
  }
}

function normalizeBlock(block: WorkThreadBlock, index: number): WorkThreadBlock {
  const createdAt = Number(block.createdAt ?? Date.now()) || Date.now();
  const updatedAt = Number(block.updatedAt ?? createdAt) || createdAt;
  const body = block.body ?? '';
  const sortKey = Number(block.sortKey ?? index);
  if (block.kind === 'task') {
    return {
      ...block,
      title: normalizeString(block.title) || undefined,
      body,
      taskAlias: block.taskAlias === 'mission' ? 'mission' : 'task',
      status: block.status === 'done' ? 'done' : block.status === 'doing' ? 'doing' : 'todo',
      resume: normalizeString(block.resume) || undefined,
      pause: normalizePause(block.pause),
      sortKey,
      createdAt,
      updatedAt,
    };
  }
  return {
    ...block,
    title: normalizeString(block.title) || undefined,
    body,
    sortKey,
    createdAt,
    updatedAt,
  };
}

function firstMissionText(thread: WorkThread): string {
  const missionBlock = thread.blocks.find(
    (block) => block.kind === 'task' && block.taskAlias === 'mission',
  );
  if (missionBlock?.title) return missionBlock.title;
  if (normalizeString(missionBlock?.body)) {
    return normalizeString(missionBlock?.body).split('\n')[0] ?? '';
  }
  return normalizeString(thread.mission) || normalizeString(thread.title);
}

function firstRunnableBlock(thread: WorkThread): Extract<WorkThreadBlock, { kind: 'task' }> | null {
  return (
    thread.blocks.find(
      (block): block is Extract<WorkThreadBlock, { kind: 'task' }> =>
        block.kind === 'task' && block.status !== 'done',
    ) ?? null
  );
}

export function buildResumeCard(
  summary: string,
  nextStep: string,
  guardrails: string[] = [],
  blockSummary?: string,
  updatedAt = Date.now(),
): WorkThreadResumeCard {
  const normalizedBlockSummary = normalizeString(blockSummary) || undefined;
  return {
    summary: normalizeString(summary),
    nextStep: normalizeString(nextStep),
    guardrails: guardrails.map((item) => item.trim()).filter(Boolean),
    blockSummary: normalizedBlockSummary,
    waitingSummary: normalizedBlockSummary,
    updatedAt,
  };
}

export function deriveWorkingSet(
  contextItems: WorkThreadContextItem[],
  limit = WORK_THREAD_WORKING_SET_LIMIT,
): WorkThreadWorkingSetItem[] {
  return contextItems.slice(0, limit).map((item) => ({
    id: item.id,
    contextItemId: item.id,
    title: item.title,
    summary: item.content,
    pinned: false,
    createdAt: item.addedAt,
  }));
}

export function buildAutoResumeCard(
  docMarkdown: string,
  nextActions: WorkThread['nextActions'],
  blockSummary?: string,
  updatedAt = Date.now(),
): WorkThreadResumeCard {
  const compact = docMarkdown.replace(/\s+/g, ' ').trim();
  const summary = compact.slice(0, 220);
  const nextStep = nextActions.find((item) => !item.done)?.text ?? '';
  return buildResumeCard(summary, nextStep, [], blockSummary, updatedAt);
}

export function createWorkThread(opts: CreateWorkThreadOptions = {}): WorkThread {
  const now = opts.now ?? Date.now();
  const title = normalizeString(opts.title) || `Thread ${new Date(now).toLocaleDateString()}`;
  const mission = normalizeString(opts.mission) || title;
  const bodyMarkdown = normalizeString(opts.docMarkdown);
  const status = normalizeLegacyStatus(opts.status);
  return {
    id: crypto.randomUUID(),
    title,
    bodyMarkdown,
    resume: undefined,
    pause: undefined,
    blocks: [],
    mission,
    status,
    lane: opts.lane ?? 'general',
    roleId: opts.roleId,
    rootMarkdown: bodyMarkdown,
    explorationMarkdown: '',
    docMarkdown: bodyMarkdown,
    contextItems: [],
    intents: [],
    sparkContainers: [],
    nextActions: [],
    resumeCard: buildAutoResumeCard(bodyMarkdown, [], undefined, now),
    workingSet: [],
    waitingFor: [],
    interrupts: [],
    explorationBlocks: [],
    inlineAnchors: [],
    schedulerMeta: {},
    syncMeta: { mode: 'internal' },
    suggestions: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function ensureWorkThreadRuntime(thread: WorkThread): WorkThread {
  const syncMeta: WorkThreadSyncMeta = {
    mode: thread.syncMeta?.mode === 'hybrid' ? 'hybrid' : 'internal',
    filePath: thread.syncMeta?.filePath,
    lastExportedHash: thread.syncMeta?.lastExportedHash,
    lastImportedAt: thread.syncMeta?.lastImportedAt,
    lastExternalModifiedAt: thread.syncMeta?.lastExternalModifiedAt,
  };
  const bodyMarkdown = thread.bodyMarkdown ?? thread.rootMarkdown ?? thread.docMarkdown ?? '';
  const blocks = (thread.blocks ?? []).map((block, index) => normalizeBlock(block, index));
  const resume =
    normalizeString(thread.resume) ||
    normalizeString(
      firstRunnableBlock({ ...thread, bodyMarkdown, blocks } as WorkThread)?.resume,
    ) ||
    normalizeString(thread.resumeCard?.nextStep) ||
    undefined;
  const pause =
    normalizePause(thread.pause) ||
    (() => {
      const runnable = firstRunnableBlock({ ...thread, bodyMarkdown, blocks } as WorkThread);
      return normalizePause(runnable?.pause);
    })() ||
    (() => {
      const legacy = normalizeString(
        thread.resumeCard?.blockSummary || thread.resumeCard?.waitingSummary,
      );
      if (!legacy) return undefined;
      return { reason: legacy, updatedAt: thread.updatedAt };
    })();
  const mission =
    normalizeString(thread.mission) ||
    firstMissionText({ ...thread, bodyMarkdown, blocks } as WorkThread);
  const blockSummary = pause?.reason;
  const runnableBlock = firstRunnableBlock({ ...thread, bodyMarkdown, blocks } as WorkThread);
  return {
    ...thread,
    bodyMarkdown,
    blocks,
    mission: mission || normalizeString(thread.title),
    lane: thread.lane ?? 'general',
    status: normalizeLegacyStatus(thread.status),
    resume: resume || undefined,
    pause,
    rootMarkdown: thread.rootMarkdown ?? bodyMarkdown,
    explorationMarkdown: thread.explorationMarkdown ?? '',
    docMarkdown: thread.docMarkdown ?? bodyMarkdown,
    contextItems: thread.contextItems ?? [],
    intents: (thread.intents ?? []).map((intent) => ({
      ...intent,
      bodyMarkdown: intent.bodyMarkdown ?? intent.detail ?? '',
      collapsed: intent.collapsed ?? false,
      parentThreadId: intent.parentThreadId ?? thread.id,
    })),
    sparkContainers: (thread.sparkContainers ?? []).map((spark) => ({
      ...spark,
      bodyMarkdown: spark.bodyMarkdown ?? '',
      collapsed: spark.collapsed ?? false,
      parentThreadId: spark.parentThreadId ?? thread.id,
    })),
    nextActions: (thread.nextActions ?? []).map((action) => ({
      ...action,
      parentThreadId: action.parentThreadId ?? thread.id,
    })),
    resumeCard: thread.resumeCard
      ? buildResumeCard(
          normalizeString(thread.resumeCard.summary) ||
            bodyMarkdown.replace(/\s+/g, ' ').trim().slice(0, 220) ||
            mission,
          resume || normalizeString(thread.resumeCard.nextStep),
          thread.resumeCard.guardrails ?? [],
          blockSummary,
          thread.resumeCard.updatedAt ?? thread.updatedAt,
        )
      : buildResumeCard(
          bodyMarkdown.replace(/\s+/g, ' ').trim().slice(0, 220) || mission,
          resume ||
            normalizeString(runnableBlock?.title) ||
            normalizeString(runnableBlock?.body).split('\n')[0] ||
            '',
          [],
          blockSummary,
          thread.updatedAt,
        ),
    workingSet:
      thread.workingSet && thread.workingSet.length > 0
        ? thread.workingSet
        : deriveWorkingSet(thread.contextItems ?? []),
    waitingFor: (thread.waitingFor ?? []).map((item) => ({
      ...item,
      parentThreadId: item.parentThreadId ?? thread.id,
    })),
    interrupts: (thread.interrupts ?? []).map((item) => ({
      ...item,
      parentThreadId: item.parentThreadId ?? thread.id,
    })),
    explorationBlocks: thread.explorationBlocks ?? [],
    inlineAnchors: thread.inlineAnchors ?? [],
    schedulerMeta: thread.schedulerMeta ?? {},
    syncMeta,
    suggestions: thread.suggestions ?? [],
  };
}

function taskUrgencyBoost(thread: WorkThread, linkedTasks: Task[]): number {
  const ids = new Set(
    thread.blocks
      .filter((block) => block.kind === 'task')
      .map((block) => block.linkedTaskId)
      .filter((value): value is string => Boolean(value)),
  );
  let boost = 0;
  for (const task of linkedTasks) {
    if (!ids.has(task.id)) continue;
    if (task.ddl) {
      const delta = task.ddl.getTime() - Date.now();
      if (delta <= 0) boost += 35;
      else if (delta <= 48 * 3600 * 1000) boost += 20;
    }
  }
  return boost;
}

export function scoreWorkThreadForNow(thread: WorkThread, linkedTasks: Task[] = []): number {
  const normalized = ensureWorkThreadRuntime(thread);
  if (normalized.status === 'archived' || normalized.status === 'done') {
    return Number.NEGATIVE_INFINITY;
  }
  let score = normalized.status === 'active' ? 120 : 40;
  if (normalizeString(normalized.resume)) score += 30;
  if (normalizeString(normalized.pause?.then)) score += 8;
  if (normalizeString(normalized.resumeCard.summary)) score += 10;
  if (normalized.blocks.some((block) => block.kind === 'task' && block.taskAlias === 'mission')) {
    score += 12;
  }
  if (normalized.blocks.some((block) => block.kind === 'task' && block.status !== 'done')) {
    score += 10;
  }
  if (normalized.schedulerMeta.wakeReason) score += 10;
  if (normalized.workingSet.length > 0) score += 8;
  if (normalized.lane === 'meta') score -= 8;
  if (normalized.lane === 'infrastructure') score -= 4;
  score += taskUrgencyBoost(normalized, linkedTasks);
  return score;
}

export function pickWorkThreadForNow(
  threads: WorkThread[],
  policy: WorkThreadSchedulerPolicy,
  linkedTasks: Task[] = [],
): WorkThreadRecommendation | null {
  if (threads.length === 0) return null;
  const normalized = threads.map(ensureWorkThreadRuntime);
  const active = normalized.find((thread) => thread.status === 'active');
  if (active) {
    return {
      thread: active,
      reason: 'Continue the thread already in progress.',
      score: Number.MAX_SAFE_INTEGER,
    };
  }

  if (policy === 'manual') return null;

  const candidates = normalized
    .filter((thread) => thread.status === 'paused')
    .map((thread) => ({
      thread,
      score: scoreWorkThreadForNow(thread, linkedTasks),
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best) return null;
  return {
    thread: best.thread,
    reason:
      policy === 'semi_auto'
        ? 'This thread is the strongest resume candidate right now.'
        : 'This thread looks easy to re-enter with a clear next step.',
    score: best.score,
  };
}
