import type {
  WorkThread,
  WorkThreadBlock,
  WorkThreadBlockView,
} from '../models/work-thread.js';

export function buildWorkThreadBlockViews(
  thread: Pick<WorkThread, 'waitingFor' | 'interrupts'>,
): WorkThreadBlockView[] {
  const waitingBlocks: WorkThreadBlockView[] = thread.waitingFor.map((item) => ({
    id: item.id,
    title: item.title,
    detail: item.detail,
    state: item.satisfied ? 'cleared' : 'open',
    sourceKind: 'waiting',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));

  const interruptBlocks: WorkThreadBlockView[] = thread.interrupts.map((item) => ({
    id: item.id,
    title: item.title,
    detail: item.content,
    state: item.resolved ? 'cleared' : 'open',
    sourceKind: 'interrupt',
    createdAt: item.capturedAt,
    updatedAt: item.capturedAt,
  }));

  return [...waitingBlocks, ...interruptBlocks].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function listWorkThreadBlocks(
  thread: Pick<WorkThread, 'blocks'>,
  kind?: WorkThreadBlock['kind'],
): WorkThreadBlock[] {
  const blocks = kind
    ? thread.blocks.filter((block) => block.kind === kind)
    : [...thread.blocks];
  return blocks.sort((left, right) => left.sortKey - right.sortKey || left.createdAt - right.createdAt);
}

export function buildWorkThreadBlockStats(thread: Pick<WorkThread, 'blocks'>) {
  let missions = 0;
  let tasks = 0;
  let sparks = 0;
  let logs = 0;
  for (const block of thread.blocks) {
    if (block.kind === 'task') {
      if (block.taskAlias === 'mission') missions += 1;
      else tasks += 1;
      continue;
    }
    if (block.kind === 'spark') sparks += 1;
    if (block.kind === 'log') logs += 1;
  }
  return {
    missions,
    tasks,
    sparks,
    logs,
    total: thread.blocks.length,
  };
}
