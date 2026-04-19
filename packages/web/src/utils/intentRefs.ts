import type { WorkThreadIntent } from '@my-little-todo/core';

export interface ParsedIntentRef {
  intentId: string;
  displayName: string;
  fullMatch: string;
  index: number;
}

export interface IntentRefDeleteRange {
  from: number;
  to: number;
}

const INTENT_REF_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/i;

export function sanitizeIntentRefLabel(title: string): string {
  return title.replace(/\|/g, '/').replace(/\]/g, '').trim();
}

export function formatIntentRefMarkdown(intent: Pick<WorkThreadIntent, 'id' | 'text'>): string {
  const label = sanitizeIntentRefLabel(intent.text).slice(0, 72) || 'Intent';
  return `[[intent:${intent.id}|${label}]]`;
}

export function parseIntentRefs(markdown: string): ParsedIntentRef[] {
  const re = /\[\[intent:([a-z0-9][a-z0-9:_-]{0,127})\|([^\]]+)\]\]/gi;
  const out: ParsedIntentRef[] = [];
  let match = re.exec(markdown);
  while (match !== null) {
    out.push({
      intentId: match[1],
      displayName: match[2],
      fullMatch: match[0],
      index: match.index,
    });
    match = re.exec(markdown);
  }
  return out;
}

export function findIntentRefDeleteRange(
  markdown: string,
  cursor: number,
  direction: 'backward' | 'forward',
): IntentRefDeleteRange | null {
  const refs = parseIntentRefs(markdown);
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

export function resolveIntentRefToId(
  intentId: string,
  intents: Array<Pick<WorkThreadIntent, 'id'>>,
): string | undefined {
  if (!INTENT_REF_ID_PATTERN.test(intentId)) return undefined;
  return intents.find((intent) => intent.id === intentId)?.id;
}
