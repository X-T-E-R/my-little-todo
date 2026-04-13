import type { WindowContext, WindowContextMatchMode } from '@my-little-todo/core';

export type ForegroundPayload = {
  title: string;
  processName?: string | null;
  processId: number;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function processMatches(ctx: WindowContext, processName: string | null | undefined): boolean {
  const want = ctx.processName?.trim();
  if (!want) return true;
  if (!processName) return false;
  return norm(processName) === norm(want);
}

function titleMatches(
  mode: WindowContextMatchMode,
  pattern: string | undefined,
  title: string,
): boolean {
  const p = pattern?.trim();
  if (!p) return true;
  switch (mode) {
    case 'exact':
      return norm(title) === norm(p);
    case 'contains':
      return norm(title).includes(norm(p));
    case 'regex':
      try {
        return new RegExp(p, 'i').test(title);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/** First matching rule wins (DB returns newest first). */
export function matchWindowContexts(
  contexts: WindowContext[],
  fg: ForegroundPayload,
): WindowContext | null {
  for (const ctx of contexts) {
    if (!processMatches(ctx, fg.processName)) continue;
    if (!titleMatches(ctx.matchMode, ctx.titlePattern, fg.title)) continue;
    return ctx;
  }
  return null;
}
