import type {
  WorkThread,
  WorkThreadInterrupt,
  WorkThreadInterruptSource,
  WorkThreadWaitingCondition,
  WorkThreadWaitingKind,
} from '../models/work-thread.js';
import { ensureWorkThreadRuntime } from './workThreadRuntime.js';

export interface WorkThreadMarkdownPatch {
  frontmatter: {
    id?: string;
    title?: string;
    mission?: string;
    status?: WorkThread['status'];
    lane?: WorkThread['lane'];
    roleId?: string;
  };
  docMarkdown: string;
  nextActions: WorkThread['nextActions'];
  waitingFor: WorkThread['waitingFor'];
  interrupts: WorkThread['interrupts'];
}

const WAITING_PREFIX = '[!waiting';
const INTERRUPT_PREFIX = '[!interrupt';

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

function normalizeLineBreaks(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n');
}

function buildFrontmatter(thread: WorkThread): string {
  const lines = [
    '---',
    `id: ${quoteYaml(thread.id)}`,
    `title: ${quoteYaml(thread.title)}`,
    `mission: ${quoteYaml(thread.mission)}`,
    `status: ${thread.status}`,
    `lane: ${thread.lane}`,
  ];
  if (thread.roleId) {
    lines.push(`roleId: ${quoteYaml(thread.roleId)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function formatWaitingBlock(item: WorkThreadWaitingCondition): string {
  const head = `> ${WAITING_PREFIX}:${item.kind}] ${item.title}`;
  const detail = item.detail?.trim()
    ? item.detail
        .trim()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    : '';
  return detail ? `${head}\n${detail}` : head;
}

function formatInterruptBlock(item: WorkThreadInterrupt): string {
  const head = `> ${INTERRUPT_PREFIX}:${item.source}] ${item.title}`;
  const detail = item.content?.trim()
    ? item.content
        .trim()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    : '';
  return detail ? `${head}\n${detail}` : head;
}

function replaceSection(markdown: string, heading: string, content: string): string {
  const normalized = normalizeLineBreaks(markdown).trim();
  const sectionRegex = new RegExp(
    `(^|\\n)## ${heading}\\n[\\s\\S]*?(?=\\n## |$)`,
    'm',
  );
  const nextSection = `## ${heading}\n\n${content.trim()}`;
  if (sectionRegex.test(normalized)) {
    return normalized.replace(sectionRegex, `$1${nextSection}`);
  }
  return normalized ? `${normalized}\n\n${nextSection}` : nextSection;
}

function materializeStructuredSections(thread: WorkThread): string {
  let body = normalizeLineBreaks(thread.docMarkdown).trim();
  if (thread.nextActions.length > 0) {
    body = replaceSection(
      body,
      'Next Actions',
      thread.nextActions.map((item) => `- [${item.done ? 'x' : ' '}] ${item.text}`).join('\n'),
    );
  }
  if (thread.waitingFor.length > 0) {
    body = replaceSection(
      body,
      'Waiting',
      thread.waitingFor.map((item) => formatWaitingBlock(item)).join('\n\n'),
    );
  }
  if (thread.interrupts.length > 0) {
    body = replaceSection(
      body,
      'Interrupts',
      thread.interrupts.map((item) => formatInterruptBlock(item)).join('\n\n'),
    );
  }
  return body;
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
    if (key === 'mission') frontmatter.mission = value;
    if (key === 'status') frontmatter.status = value as WorkThread['status'];
    if (key === 'lane') frontmatter.lane = value as WorkThread['lane'];
    if (key === 'roleId') frontmatter.roleId = value;
  }
  return frontmatter;
}

function parseChecklistActions(markdown: string): WorkThread['nextActions'] {
  const lines = normalizeLineBreaks(markdown).split('\n');
  const now = Date.now();
  const actions: WorkThread['nextActions'] = [];
  for (const [index, line] of lines.entries()) {
    const match = /^- \[( |x|X)\] (.+)$/.exec(line.trim());
    if (!match) continue;
    const checked = match[1];
    const text = match[2]?.trim();
    if (!checked || !text) continue;
    actions.push({
      id: `md-action-${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`,
      text,
      done: checked.toLowerCase() === 'x',
      source: 'user',
      createdAt: now,
    });
  }
  return actions;
}

function parseBlockMetadata(line: string, prefix: string): { kind: string; title: string } | null {
  const normalized = line.trim();
  const match = new RegExp(`^> ${prefix}:([^\\]]+)\\] (.+)$`, 'i').exec(normalized);
  if (!match) return null;
  const kind = match[1]?.trim().toLowerCase();
  const title = match[2]?.trim();
  if (!kind || !title) return null;
  return {
    kind,
    title,
  };
}

function parseQuotedBlocks(markdown: string) {
  const lines = normalizeLineBreaks(markdown).split('\n');
  const waitingFor: WorkThread['waitingFor'] = [];
  const interrupts: WorkThread['interrupts'] = [];
  let i = 0;
  while (i < lines.length) {
    const currentLine = lines[i];
    if (currentLine === undefined) break;
    const waitingMeta = parseBlockMetadata(currentLine, '\\[!waiting');
    const interruptMeta = parseBlockMetadata(currentLine, '\\[!interrupt');
    if (!waitingMeta && !interruptMeta) {
      i += 1;
      continue;
    }
    const detailLines: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const detailLine = lines[j];
      if (detailLine === undefined || !detailLine.startsWith('> ')) {
        break;
      }
      detailLines.push(detailLine.slice(2));
      j += 1;
    }
    const detail = detailLines.join('\n').trim() || undefined;
    if (waitingMeta) {
      waitingFor.push({
        id: `md-waiting-${i}`,
        kind: waitingMeta.kind as WorkThreadWaitingKind,
        title: waitingMeta.title,
        detail,
        satisfied: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    if (interruptMeta) {
      interrupts.push({
        id: `md-interrupt-${i}`,
        source: interruptMeta.kind as WorkThreadInterruptSource,
        title: interruptMeta.title,
        content: detail,
        capturedAt: Date.now(),
        resolved: false,
      });
    }
    i = j;
  }
  return { waitingFor, interrupts };
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
  const body = materializeStructuredSections(normalized);
  return `${buildFrontmatter(normalized)}\n\n${body.trim()}\n`;
}

export function parseWorkThreadMarkdown(markdown: string): WorkThreadMarkdownPatch {
  const { frontmatterRaw, body } = splitFrontmatter(markdown);
  const normalizedBody = normalizeLineBreaks(body).trim();
  const { waitingFor, interrupts } = parseQuotedBlocks(normalizedBody);
  return {
    frontmatter: parseFrontmatter(frontmatterRaw),
    docMarkdown: normalizedBody,
    nextActions: parseChecklistActions(normalizedBody),
    waitingFor,
    interrupts,
  };
}
