import type { WorkThread, WorkThreadBlockView } from '../models/work-thread.js';

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
