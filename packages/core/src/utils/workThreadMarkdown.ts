import type { WorkThread, WorkThreadBlock, WorkThreadPause } from '../models/work-thread.js';
import { ensureWorkThreadRuntime } from './workThreadRuntime.js';

export interface WorkThreadMarkdownPatch {
  frontmatter: {
    id?: string;
    title?: string;
    status?: WorkThread['status'];
    roleId?: string;
    resume?: string;
    pauseReason?: string;
    pauseThen?: string;
  };
  bodyMarkdown: string;
  blocks: WorkThreadBlock[];
  docMarkdown: string;
  rootMarkdown: string;
  explorationMarkdown: string;
  intents: WorkThread['intents'];
  sparkContainers: WorkThread['sparkContainers'];
  nextActions: WorkThread['nextActions'];
  waitingFor: WorkThread['waitingFor'];
  interrupts: WorkThread['interrupts'];
}

const LEGACY_BLOCK_HEADER_RE = /^\/(mission|task|spark|log)\s*$/i;
const CALLOUT_HEADER_RE = /^>\s*\[!(mission|task|spark|log)\](?:[+-])?\s*(.*)$/i;
const META_LINE_RE = /^([a-zA-Z0-9._-]+):\s*(.*)$/;
const BLOCK_ID_RE = /^\^([A-Za-z0-9-]+)\s*$/;
const META_COMMENT_RE = /^<!--\s*mlt-meta:\s*(\{.*\})\s*-->$/;

function normalizeLineBreaks(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n');
}

function compactMarkdown(markdown: string): string {
  return normalizeLineBreaks(markdown)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return JSON.parse(trimmed.replace(/^'/, '"').replace(/'$/, '"'));
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function splitFrontmatter(markdown: string): { frontmatterRaw: string; body: string } {
  const normalized = normalizeLineBreaks(markdown);
  if (!normalized.startsWith('---\n')) {
    return { frontmatterRaw: '', body: normalized };
  }
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) {
    return { frontmatterRaw: '', body: normalized };
  }
  return {
    frontmatterRaw: normalized.slice(4, end),
    body: normalized.slice(end + 5),
  };
}

function parseFrontmatter(raw: string): WorkThreadMarkdownPatch['frontmatter'] {
  const frontmatter: WorkThreadMarkdownPatch['frontmatter'] = {};
  for (const line of raw.split('\n')) {
    const index = line.indexOf(':');
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    const value = parseScalar(line.slice(index + 1));
    if (!value) continue;
    if (key === 'id') frontmatter.id = value;
    if (key === 'title') frontmatter.title = value;
    if (key === 'status') frontmatter.status = value as WorkThread['status'];
    if (key === 'roleId') frontmatter.roleId = value;
    if (key === 'resume') frontmatter.resume = value;
    if (key === 'pause.reason') frontmatter.pauseReason = value;
    if (key === 'pause.then') frontmatter.pauseThen = value;
  }
  return frontmatter;
}

function buildFrontmatter(thread: WorkThread): string {
  const lines = ['---', `id: ${quoteYaml(thread.id)}`, `title: ${quoteYaml(thread.title)}`];
  lines.push(`status: ${thread.status}`);
  if (thread.roleId) lines.push(`roleId: ${quoteYaml(thread.roleId)}`);
  if (thread.resume) lines.push(`resume: ${quoteYaml(thread.resume)}`);
  if (thread.pause?.reason) lines.push(`pause.reason: ${quoteYaml(thread.pause.reason)}`);
  if (thread.pause?.then) lines.push(`pause.then: ${quoteYaml(thread.pause.then)}`);
  lines.push('---');
  return lines.join('\n');
}

function firstMeaningfulLine(markdown: string): string | undefined {
  return normalizeLineBreaks(markdown)
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
}

function blockCalloutKind(block: WorkThreadBlock): 'mission' | 'task' | 'spark' | 'log' {
  if (block.kind === 'task') {
    return block.taskAlias === 'mission' ? 'mission' : 'task';
  }
  return block.kind;
}

function buildBlockMeta(block: WorkThreadBlock): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    sortKey: block.sortKey,
  };
  if (block.linkedTaskId) meta.linkedTaskId = block.linkedTaskId;
  if (block.promotedStreamEntryId) meta.promotedStreamEntryId = block.promotedStreamEntryId;
  if (block.kind === 'task') {
    if (block.status) meta.status = block.status;
    if (block.resume) meta.resume = block.resume;
    if (block.pause?.reason) {
      const pauseMeta: { reason: string; then?: string } = {
        reason: block.pause.reason,
      };
      if (block.pause.then) {
        // biome-ignore lint/suspicious/noThenProperty: `pause.then` is a persisted domain field.
        pauseMeta.then = block.pause.then;
      }
      meta.pause = pauseMeta;
    }
  }
  return meta;
}

function buildPause(reason: string, thenText?: string): WorkThreadPause {
  const pause: WorkThreadPause = {
    reason,
    updatedAt: Date.now(),
  };
  if (thenText) {
    // biome-ignore lint/suspicious/noThenProperty: `pause.then` is a persisted domain field.
    pause.then = thenText;
  }
  return pause;
}

function renderQuotedLines(markdown: string): string[] {
  const normalized = compactMarkdown(markdown);
  if (!normalized) return [];
  return normalizeLineBreaks(normalized)
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'));
}

function renderBlock(block: WorkThreadBlock): string {
  const kind = blockCalloutKind(block);
  const fallbackTitle =
    kind === 'mission' ? 'Mission' : kind === 'task' ? 'Task' : kind === 'spark' ? 'Spark' : 'Log';
  const title = block.title?.trim() || firstMeaningfulLine(block.body) || fallbackTitle;
  const meta = buildBlockMeta(block);
  const lines = [`> [!${kind}] ${title}`];
  if (Object.keys(meta).length > 0) {
    lines.push(`> <!-- mlt-meta: ${JSON.stringify(meta)} -->`);
  }
  const bodyLines = renderQuotedLines(block.body);
  if (bodyLines.length > 0) {
    lines.push('>');
    lines.push(...bodyLines);
  }
  if (block.id) {
    lines.push(`^${block.id}`);
  }
  return lines.join('\n');
}

function pauseFromLegacyMeta(meta: Record<string, string>): WorkThreadPause | undefined {
  const reason = meta['pause.reason']?.trim();
  if (!reason) return undefined;
  return buildPause(reason, meta['pause.then']?.trim() || undefined);
}

function stringFromMeta(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberFromMeta(value: unknown, fallback: number): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePauseFromCalloutMeta(meta: Record<string, unknown>): WorkThreadPause | undefined {
  const rawPause = meta.pause;
  if (rawPause && typeof rawPause === 'object' && !Array.isArray(rawPause)) {
    const reason = stringFromMeta((rawPause as Record<string, unknown>).reason);
    if (!reason) return undefined;
    return buildPause(reason, stringFromMeta((rawPause as Record<string, unknown>).then));
  }
  const reason = stringFromMeta(meta.pauseReason) ?? stringFromMeta(meta['pause.reason']);
  if (!reason) return undefined;
  return buildPause(reason, stringFromMeta(meta.pauseThen) ?? stringFromMeta(meta['pause.then']));
}

function parseLegacyBlock(section: string, index: number): WorkThreadBlock | null {
  const lines = normalizeLineBreaks(section).split('\n');
  const header = lines[0]?.trim();
  const headerMatch = header ? LEGACY_BLOCK_HEADER_RE.exec(header) : null;
  if (!headerMatch?.[1]) return null;
  const headerKind = headerMatch[1].toLowerCase();
  const meta: Record<string, string> = {};
  const bodyLines: string[] = [];
  let mode: 'meta' | 'body' = 'meta';
  for (const rawLine of lines.slice(1)) {
    const line = rawLine.replace(/\s+$/u, '');
    if (mode === 'meta') {
      if (!line.trim()) {
        mode = 'body';
        continue;
      }
      const match = META_LINE_RE.exec(line.trim());
      if (match?.[1]) {
        meta[match[1]] = match[2] ?? '';
        continue;
      }
      mode = 'body';
    }
    bodyLines.push(rawLine);
  }
  const base = {
    id: meta.id?.trim() || `md-block-${index}`,
    title: meta.title?.trim() || undefined,
    body: compactMarkdown(bodyLines.join('\n')),
    sortKey: Number(meta.sortKey ?? index),
    linkedTaskId: meta.linkedTaskId?.trim() || undefined,
    promotedStreamEntryId: meta.promotedStreamEntryId?.trim() || undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  if (headerKind === 'mission' || headerKind === 'task') {
    return {
      ...base,
      kind: 'task',
      taskAlias: headerKind === 'mission' ? 'mission' : 'task',
      status: meta.status === 'done' ? 'done' : meta.status === 'doing' ? 'doing' : 'todo',
      resume: meta.resume?.trim() || undefined,
      pause: pauseFromLegacyMeta(meta),
    };
  }
  if (headerKind === 'spark') {
    return {
      ...base,
      kind: 'spark',
    };
  }
  return {
    ...base,
    kind: 'log',
  };
}

function parseCalloutMeta(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed inline metadata
  }
  return {};
}

function stripQuotePrefix(line: string): string {
  return line.replace(/^>\s?/, '');
}

function parseCalloutBlock(
  lines: string[],
  start: number,
  index: number,
): { block: WorkThreadBlock; nextIndex: number } | null {
  const headerLine = lines[start] ?? '';
  const headerMatch = CALLOUT_HEADER_RE.exec(headerLine);
  if (!headerMatch?.[1]) return null;
  const headerKind = headerMatch[1].toLowerCase();
  const title = (headerMatch[2] ?? '').trim() || undefined;
  const bodyLines: string[] = [];
  let meta: Record<string, unknown> = {};
  let blockId: string | null = null;
  let cursor = start + 1;

  while (cursor < lines.length) {
    const line = lines[cursor] ?? '';
    const blockIdMatch = BLOCK_ID_RE.exec(line.trim());
    if (blockIdMatch?.[1]) {
      blockId = blockIdMatch[1];
      cursor += 1;
      break;
    }
    if (line.startsWith('>')) {
      const unquoted = stripQuotePrefix(line);
      const metaMatch = META_COMMENT_RE.exec(unquoted.trim());
      if (metaMatch?.[1]) {
        meta = parseCalloutMeta(metaMatch[1]);
        cursor += 1;
        continue;
      }
      bodyLines.push(unquoted);
      cursor += 1;
      continue;
    }
    if (!line.trim()) {
      break;
    }
    break;
  }

  const base = {
    id: blockId || stringFromMeta(meta.id) || `md-block-${index}`,
    title,
    body: compactMarkdown(bodyLines.join('\n')),
    sortKey: numberFromMeta(meta.sortKey, index),
    linkedTaskId: stringFromMeta(meta.linkedTaskId),
    promotedStreamEntryId: stringFromMeta(meta.promotedStreamEntryId),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (headerKind === 'mission' || headerKind === 'task') {
    return {
      block: {
        ...base,
        kind: 'task',
        taskAlias: headerKind === 'mission' ? 'mission' : 'task',
        status: meta.status === 'done' ? 'done' : meta.status === 'doing' ? 'doing' : 'todo',
        resume: stringFromMeta(meta.resume),
        pause: parsePauseFromCalloutMeta(meta),
      },
      nextIndex: Math.max(start, cursor - 1),
    };
  }

  if (headerKind === 'spark') {
    return {
      block: {
        ...base,
        kind: 'spark',
      },
      nextIndex: Math.max(start, cursor - 1),
    };
  }

  return {
    block: {
      ...base,
      kind: 'log',
    },
    nextIndex: Math.max(start, cursor - 1),
  };
}

function splitBodyAndLegacyBlocks(markdown: string): {
  bodyMarkdown: string;
  blocks: WorkThreadBlock[];
} {
  const normalized = normalizeLineBreaks(markdown).trim();
  if (!normalized) return { bodyMarkdown: '', blocks: [] };
  const lines = normalized.split('\n');
  const sections: string[] = [];
  let current: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    const isHeader = LEGACY_BLOCK_HEADER_RE.test(line.trim());
    if (isHeader) {
      if (current.length > 0) {
        sections.push(current.join('\n'));
      }
      current = [line];
      inBlock = true;
      continue;
    }
    if (!inBlock) {
      current.push(line);
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) {
    sections.push(current.join('\n'));
  }

  const bodySections: string[] = [];
  const blocks: WorkThreadBlock[] = [];
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    if (!LEGACY_BLOCK_HEADER_RE.test(trimmed.split('\n')[0] ?? '')) {
      bodySections.push(trimmed);
      continue;
    }
    const block = parseLegacyBlock(trimmed, blocks.length);
    if (block) {
      blocks.push(block);
    }
  }
  return {
    bodyMarkdown: compactMarkdown(bodySections.join('\n\n')),
    blocks,
  };
}

function splitBodyAndCalloutBlocks(markdown: string): {
  bodyMarkdown: string;
  blocks: WorkThreadBlock[];
} {
  const normalized = normalizeLineBreaks(markdown).trim();
  if (!normalized) return { bodyMarkdown: '', blocks: [] };
  const lines = normalized.split('\n');
  const bodyLines: string[] = [];
  const blocks: WorkThreadBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const parsed = parseCalloutBlock(lines, index, blocks.length);
    if (parsed) {
      blocks.push(parsed.block);
      index = parsed.nextIndex + 1;
      continue;
    }
    bodyLines.push(lines[index] ?? '');
    index += 1;
  }

  return {
    bodyMarkdown: compactMarkdown(bodyLines.join('\n')),
    blocks,
  };
}

function parseLegacyBody(markdown: string): { bodyMarkdown: string; blocks: WorkThreadBlock[] } {
  const bodyMarkdown = compactMarkdown(markdown);
  return { bodyMarkdown, blocks: [] };
}

function hasCalloutBlocks(markdown: string): boolean {
  return normalizeLineBreaks(markdown)
    .split('\n')
    .some((line) => CALLOUT_HEADER_RE.test(line));
}

function hasLegacyBlocks(markdown: string): boolean {
  return normalizeLineBreaks(markdown)
    .split('\n')
    .some((line) => LEGACY_BLOCK_HEADER_RE.test(line.trim()));
}

export function hashWorkThreadMarkdown(markdown: string): string {
  let hash = 5381;
  for (const char of normalizeLineBreaks(markdown)) {
    hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}

export function serializeWorkThreadToMarkdown(thread: WorkThread): string {
  const normalized = ensureWorkThreadRuntime(thread);
  const parts = [buildFrontmatter(normalized)];
  if (normalized.bodyMarkdown.trim()) {
    parts.push(normalized.bodyMarkdown.trim());
  }
  const renderedBlocks = normalized.blocks
    .sort((left, right) => left.sortKey - right.sortKey || left.createdAt - right.createdAt)
    .map((block) => renderBlock(block));
  if (renderedBlocks.length > 0) {
    parts.push(renderedBlocks.join('\n\n'));
  }
  return `${parts.filter(Boolean).join('\n\n').trim()}\n`;
}

export function parseWorkThreadMarkdown(markdown: string): WorkThreadMarkdownPatch {
  const { frontmatterRaw, body } = splitFrontmatter(markdown);
  const frontmatter = parseFrontmatter(frontmatterRaw);
  const normalizedBody = compactMarkdown(body);
  const parsed = hasCalloutBlocks(normalizedBody)
    ? splitBodyAndCalloutBlocks(normalizedBody)
    : hasLegacyBlocks(normalizedBody)
      ? splitBodyAndLegacyBlocks(normalizedBody)
      : parseLegacyBody(normalizedBody);

  return {
    frontmatter,
    bodyMarkdown: parsed.bodyMarkdown,
    blocks: parsed.blocks,
    docMarkdown: normalizedBody,
    rootMarkdown: parsed.bodyMarkdown,
    explorationMarkdown: '',
    intents: [],
    sparkContainers: [],
    nextActions: [],
    waitingFor: [],
    interrupts: [],
  };
}
