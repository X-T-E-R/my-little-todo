import type { WorkThreadEvent } from '@my-little-todo/core';

export type WorkThreadRawCaptureKind = 'note' | 'resource';
export type WorkThreadRawCaptureSource = 'editor' | 'brain-dump' | 'quick-input';

export interface WorkThreadRawCaptureCandidate {
  text: string;
  kind: WorkThreadRawCaptureKind;
  blockIndex: number;
}

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n').trim();
}

function isInlineSemanticRefBlock(block: string): boolean {
  return /^(?:\[\[(?:task|intent|spark|next|block):[^\]]+\]\]\s*)+$/i.test(block.trim());
}

function isStructuredRuntimeBlock(block: string): boolean {
  const trimmed = block.trim();
  if (!trimmed) return true;
  if (/^(- \[[ xX]\] .+\n?)+$/m.test(trimmed)) return true;
  if (isInlineSemanticRefBlock(trimmed)) return true;
  if (/^> \[!waiting:/i.test(trimmed)) return true;
  if (/^> \[!interrupt:/i.test(trimmed)) return true;
  if (/^> \[!block(?::[^\]]+)?\]/i.test(trimmed)) return true;
  if (/^#{3,6}\s+(waiting|interrupt|等待|中断)\s*[·•|-]\s*[a-z]+\s*[:：]\s*.+$/im.test(trimmed)) return true;
  if (/^#{3,6}\s+(block|卡点)\s*[·•|-]?\s*.+$/im.test(trimmed)) return true;
  if (/^##\s+Checkpoint\b/i.test(trimmed)) return true;
  return false;
}

function isHeadingOnlyBlock(block: string): boolean {
  return /^#{1,6}\s+.+$/m.test(block.trim());
}

function detectCaptureKind(block: string): WorkThreadRawCaptureKind {
  const trimmed = block.trim();
  if (
    /^!\[[^\]]*\]\([^)]+\)$/.test(trimmed) ||
    /^\[[^\]]+\]\([^)]+\)$/.test(trimmed) ||
    /^https?:\/\/\S+$/i.test(trimmed)
  ) {
    return 'resource';
  }
  return 'note';
}

export function appendRawCaptureToMarkdown(markdown: string, capture: string): string {
  const base = markdown.replace(/\r\n/g, '\n').trim();
  const block = capture.replace(/\r\n/g, '\n').trim();
  if (!block) return base;
  if (!base) return block;
  return `${base}\n\n${block}`;
}

export function extractRawCaptureCandidates(markdown: string): WorkThreadRawCaptureCandidate[] {
  const normalized = normalizeMarkdown(markdown);
  if (!normalized) return [];

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .filter((block, index) => {
      if (isStructuredRuntimeBlock(block)) return false;
      if (isHeadingOnlyBlock(block)) return false;
      const previousBlock = blocks[index - 1] ?? '';
      if (
        index > 0 &&
        isStructuredRuntimeBlock(previousBlock) &&
        !isInlineSemanticRefBlock(previousBlock)
      ) {
        return false;
      }
      return true;
    })
    .map((block, blockIndex) => ({
      text: block,
      kind: detectCaptureKind(block),
      blockIndex,
    }));
}

export function collectNewRawCaptureCandidates(
  previousMarkdown: string,
  nextMarkdown: string,
): WorkThreadRawCaptureCandidate[] {
  const previous = extractRawCaptureCandidates(previousMarkdown);
  const current = extractRawCaptureCandidates(nextMarkdown);
  if (current.length === 0) return [];

  const previousCounts = new Map<string, number>();
  for (const item of previous) {
    previousCounts.set(item.text, (previousCounts.get(item.text) ?? 0) + 1);
  }

  const currentCounts = new Map<string, number>();
  const additions: WorkThreadRawCaptureCandidate[] = [];
  for (const item of current) {
    const nextCount = (currentCounts.get(item.text) ?? 0) + 1;
    currentCounts.set(item.text, nextCount);
    if (nextCount > (previousCounts.get(item.text) ?? 0)) {
      additions.push(item);
    }
  }

  return additions;
}

function summarizeCapture(text: string, maxLength = 64): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3)}...`;
}

export function buildRawCaptureEvent(
  threadId: string,
  text: string,
  options?: {
    source?: WorkThreadRawCaptureSource;
    blockIndex?: number;
    now?: number;
  },
): WorkThreadEvent {
  const trimmed = text.trim();
  const kind = detectCaptureKind(trimmed);
  return {
    id: crypto.randomUUID(),
    threadId,
    type: 'raw_capture_added',
    actor: 'user',
    title:
      kind === 'resource'
        ? `Captured resource: ${summarizeCapture(trimmed)}`
        : `Captured note: ${summarizeCapture(trimmed)}`,
    detailMarkdown: trimmed,
    payload: {
      source: options?.source ?? 'editor',
      kind,
      blockIndex: options?.blockIndex ?? 0,
    },
    createdAt: options?.now ?? Date.now(),
  };
}

export function buildRawCaptureEvents(
  threadId: string,
  previousMarkdown: string,
  nextMarkdown: string,
  now = Date.now(),
): WorkThreadEvent[] {
  const additions = collectNewRawCaptureCandidates(previousMarkdown, nextMarkdown);
  return additions.map((capture, index) =>
    buildRawCaptureEvent(threadId, capture.text, {
      source: 'editor',
      blockIndex: capture.blockIndex,
      now: now + index,
    }),
  );
}
