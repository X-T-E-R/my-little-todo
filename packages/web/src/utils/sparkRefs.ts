import type { StreamEntry } from '@my-little-todo/core';

export interface ParsedSparkRef {
  entryId: string;
  displayName: string;
  fullMatch: string;
  index: number;
}

export interface SparkRefDeleteRange {
  from: number;
  to: number;
}

const SPARK_REF_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/i;

export function sanitizeSparkRefLabel(title: string): string {
  return title.replace(/\|/g, '/').replace(/\]/g, '');
}

function summarizeSparkLabel(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.slice(0, 72) || 'Untitled spark';
}

export function formatSparkRefMarkdown(entry: Pick<StreamEntry, 'id' | 'content'>): string {
  const label = sanitizeSparkRefLabel(summarizeSparkLabel(entry.content));
  return `[[spark:${entry.id}|${label}]]`;
}

export function parseSparkRefs(markdown: string): ParsedSparkRef[] {
  const re = /\[\[spark:([a-z0-9][a-z0-9:_-]{0,127})\|([^\]]+)\]\]/gi;
  const out: ParsedSparkRef[] = [];
  let match = re.exec(markdown);
  while (match !== null) {
    out.push({
      entryId: match[1],
      displayName: match[2],
      fullMatch: match[0],
      index: match.index,
    });
    match = re.exec(markdown);
  }
  return out;
}

export function findSparkRefDeleteRange(
  markdown: string,
  cursor: number,
  direction: 'backward' | 'forward',
): SparkRefDeleteRange | null {
  const refs = parseSparkRefs(markdown);
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

export function resolveSparkRefToId(
  entryId: string,
  entries: Array<Pick<StreamEntry, 'id'>>,
): string | undefined {
  if (!SPARK_REF_ID_PATTERN.test(entryId)) return undefined;
  return entries.find((entry) => entry.id === entryId)?.id;
}
