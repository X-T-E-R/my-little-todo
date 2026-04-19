import type { WorkThreadNextAction } from '@my-little-todo/core';

export interface ParsedNextRef {
  actionId: string;
  displayName: string;
  fullMatch: string;
  index: number;
}

export interface NextRefDeleteRange {
  from: number;
  to: number;
}

const NEXT_REF_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/i;

export function sanitizeNextRefLabel(title: string): string {
  return title.replace(/\|/g, '/').replace(/\]/g, '').trim();
}

export function formatNextRefMarkdown(action: Pick<WorkThreadNextAction, 'id' | 'text'>): string {
  const label = sanitizeNextRefLabel(action.text).slice(0, 72) || 'Next';
  return `[[next:${action.id}|${label}]]`;
}

export function parseNextRefs(markdown: string): ParsedNextRef[] {
  const re = /\[\[next:([a-z0-9][a-z0-9:_-]{0,127})\|([^\]]+)\]\]/gi;
  const out: ParsedNextRef[] = [];
  let match = re.exec(markdown);
  while (match !== null) {
    out.push({
      actionId: match[1],
      displayName: match[2],
      fullMatch: match[0],
      index: match.index,
    });
    match = re.exec(markdown);
  }
  return out;
}

export function findNextRefDeleteRange(
  markdown: string,
  cursor: number,
  direction: 'backward' | 'forward',
): NextRefDeleteRange | null {
  const refs = parseNextRefs(markdown);
  for (const ref of refs) {
    const from = ref.index;
    const to = ref.index + ref.fullMatch.length;
    const inside = cursor > from && cursor < to;
    if (inside) return { from, to };
    if (direction === 'backward' && cursor === to) return { from, to };
    if (direction === 'forward' && cursor === from) return { from, to };
  }
  return null;
}

export function resolveNextRefToId(
  actionId: string,
  actions: Array<Pick<WorkThreadNextAction, 'id'>>,
): string | undefined {
  if (!NEXT_REF_ID_PATTERN.test(actionId)) return undefined;
  return actions.find((action) => action.id === actionId)?.id;
}
