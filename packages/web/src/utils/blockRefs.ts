export interface ParsedBlockRef {
  blockId: string;
  displayName: string;
  fullMatch: string;
  index: number;
}

export interface BlockRefDeleteRange {
  from: number;
  to: number;
}

const BLOCK_REF_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/i;

export function sanitizeBlockRefLabel(title: string): string {
  return title.replace(/\|/g, '/').replace(/\]/g, '').trim();
}

export function formatBlockRefMarkdown(block: { id: string; title: string }): string {
  const label = sanitizeBlockRefLabel(block.title).slice(0, 72) || 'Block';
  return `[[block:${block.id}|${label}]]`;
}

export function parseBlockRefs(markdown: string): ParsedBlockRef[] {
  const re = /\[\[block:([a-z0-9][a-z0-9:_-]{0,127})\|([^\]]+)\]\]/gi;
  const out: ParsedBlockRef[] = [];
  let match = re.exec(markdown);
  while (match !== null) {
    out.push({
      blockId: match[1],
      displayName: match[2],
      fullMatch: match[0],
      index: match.index,
    });
    match = re.exec(markdown);
  }
  return out;
}

export function findBlockRefDeleteRange(
  markdown: string,
  cursor: number,
  direction: 'backward' | 'forward',
): BlockRefDeleteRange | null {
  const refs = parseBlockRefs(markdown);
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

export function resolveBlockRefToId(
  blockId: string,
  blocks: Array<{ id: string }>,
): string | undefined {
  if (!BLOCK_REF_ID_PATTERN.test(blockId)) return undefined;
  return blocks.find((block) => block.id === blockId)?.id;
}
