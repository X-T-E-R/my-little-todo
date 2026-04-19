import type { Task } from '../models/task.js';
import type {
  WorkThread,
  WorkThreadContextItem,
  WorkThreadLane,
  WorkThreadResumeCard,
  WorkThreadSchedulerPolicy,
  WorkThreadSyncMeta,
  WorkThreadStatus,
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
  const docMarkdown = opts.docMarkdown ?? '';
  return {
    id: crypto.randomUUID(),
    title,
    mission,
    status: opts.status ?? 'ready',
    lane: opts.lane ?? 'general',
    roleId: opts.roleId,
    rootMarkdown: docMarkdown,
    explorationMarkdown: '',
    docMarkdown,
    contextItems: [],
    intents: [],
    sparkContainers: [],
    nextActions: [],
    resumeCard: buildAutoResumeCard(docMarkdown, [], undefined, now),
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
  return {
    ...thread,
    mission: normalizeString(thread.mission) || normalizeString(thread.title),
    lane: thread.lane ?? 'general',
    status: thread.status ?? 'ready',
    rootMarkdown: thread.rootMarkdown ?? thread.docMarkdown ?? '',
    explorationMarkdown: thread.explorationMarkdown ?? '',
    docMarkdown: thread.docMarkdown ?? '',
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
    resumeCard:
      thread.resumeCard
        ? {
            ...thread.resumeCard,
            blockSummary:
              normalizeString(thread.resumeCard.blockSummary) ||
              normalizeString(thread.resumeCard.waitingSummary) ||
              undefined,
            waitingSummary:
              normalizeString(thread.resumeCard.waitingSummary) ||
              normalizeString(thread.resumeCard.blockSummary) ||
              undefined,
          }
        : buildAutoResumeCard(thread.docMarkdown ?? '', thread.nextActions ?? [], undefined, thread.updatedAt),
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
    thread.nextActions.map((item) => item.linkedTaskId).filter((value): value is string => Boolean(value)),
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
  if (thread.status !== 'ready') return Number.NEGATIVE_INFINITY;
  let score = 0;
  if (normalizeString(thread.resumeCard.nextStep)) score += 30;
  if (normalizeString(thread.resumeCard.summary)) score += 10;
  if (thread.schedulerMeta.wakeReason) score += 15;
  if (thread.workingSet.length > 0) score += 8;
  if (thread.lane === 'meta') score -= 12;
  if (thread.lane === 'infrastructure') score -= 8;
  score += taskUrgencyBoost(thread, linkedTasks);
  return score;
}

export function pickWorkThreadForNow(
  threads: WorkThread[],
  policy: WorkThreadSchedulerPolicy,
  linkedTasks: Task[] = [],
): WorkThreadRecommendation | null {
  if (threads.length === 0) return null;
  const normalized = threads.map(ensureWorkThreadRuntime);
  const running = normalized.find((thread) => thread.status === 'running');
  if (running) {
    return {
      thread: running,
      reason: 'Continue the thread already in progress.',
      score: Number.MAX_SAFE_INTEGER,
    };
  }

  if (policy === 'manual') return null;

  const candidates = normalized
    .filter((thread) => thread.status === 'ready')
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
        : 'This thread looks ready to resume with a clear next step.',
    score: best.score,
  };
}
