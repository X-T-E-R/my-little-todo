import type {
  WorkThread,
  WorkThreadInterrupt,
  WorkThreadInterruptSource,
  WorkThreadNextAction,
  WorkThreadSparkContainer,
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
  rootMarkdown: string;
  explorationMarkdown: string;
  intents: WorkThread['intents'];
  sparkContainers: WorkThread['sparkContainers'];
  nextActions: WorkThread['nextActions'];
  waitingFor: WorkThread['waitingFor'];
  interrupts: WorkThread['interrupts'];
}

const STRUCTURED_HEADING_RE =
  /^#{2,6}\s+(waiting|interrupt|等待|中断|打断)\s*[·•|-]\s*([a-z_]+)\s*[:：]\s*(.+)$/i;
const LEGACY_NEXT_HEADING_RE = /^#{2,6}\s+(next|next step|next action|下一步)\b/i;

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
  return markdown.replace(/\r\n/g, '\n').replace(/<br\s*\/?>/gi, '\n');
}

function compactMarkdown(markdown: string): string {
  return normalizeLineBreaks(markdown).replace(/\n{3,}/g, '\n\n').trim();
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

function quotePrefix(depth: number): string {
  return Array.from({ length: depth }, () => '>').join(' ');
}

function quoteLine(depth: number, line: string): string {
  const prefix = quotePrefix(depth);
  return line ? `${prefix} ${line}` : prefix;
}

function quoteLines(depth: number, markdown: string): string[] {
  const normalized = compactMarkdown(markdown);
  if (!normalized) return [];
  return normalized.split('\n').map((line) => quoteLine(depth, line));
}

function calloutMarker(collapsed: boolean): string {
  return collapsed ? '-' : '+';
}

function sanitizeTitle(text: string, fallback: string): string {
  const trimmed = text.trim();
  return trimmed || fallback;
}

function buildBlockLines(
  title: string,
  detail: string | undefined,
  depth: number,
): string[] {
  const lines = [quoteLine(depth, `[!block] ${sanitizeTitle(title, 'Block')}`)];
  const detailLines = quoteLines(depth, detail ?? '');
  if (detailLines.length > 0) {
    lines.push(quoteLine(depth, ''));
    lines.push(...detailLines);
  }
  return lines;
}

function sortByCreatedAt<T extends { createdAt?: number; capturedAt?: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftTs = left.createdAt ?? left.capturedAt ?? 0;
    const rightTs = right.createdAt ?? right.capturedAt ?? 0;
    return leftTs - rightTs;
  });
}

function renderSparkContainer(
  thread: WorkThread,
  spark: WorkThreadSparkContainer,
  depth: number,
  visited: Set<string>,
): string[] {
  if (visited.has(spark.id)) return [];
  visited.add(spark.id);
  const lines = [quoteLine(depth, `[!spark]${calloutMarker(spark.collapsed)} ${sanitizeTitle(spark.title, 'Spark')}`)];
  const bodyLines = quoteLines(depth, spark.bodyMarkdown);
  const childNextActions = sortByCreatedAt(
    thread.nextActions.filter((item) => item.parentSparkId === spark.id),
  );
  const childBlocks = sortByCreatedAt([
    ...thread.waitingFor.filter((item) => item.parentSparkId === spark.id && !item.satisfied),
    ...thread.interrupts.filter((item) => item.parentSparkId === spark.id && !item.resolved),
  ]);
  const childSparks = sortByCreatedAt(
    thread.sparkContainers.filter((item) => item.parentSparkId === spark.id),
  );

  const content: string[] = [];
  if (bodyLines.length > 0) content.push(...bodyLines);
  for (const action of childNextActions) {
    content.push(quoteLine(depth, `- [${action.done ? 'x' : ' '}] ${action.text}`));
  }
  for (const block of childBlocks) {
    if ('kind' in block) {
      content.push(...buildBlockLines(block.title, block.detail, depth + 1));
    } else {
      content.push(...buildBlockLines(block.title, block.content, depth + 1));
    }
  }
  for (const childSpark of childSparks) {
    content.push(...renderSparkContainer(thread, childSpark, depth + 1, visited));
  }

  if (content.length > 0) {
    lines.push(quoteLine(depth, ''));
    lines.push(...content);
  }
  return lines;
}

function renderIntentContainer(thread: WorkThread, intent: WorkThread['intents'][number]): string[] {
  const lines = [quoteLine(1, `[!intent]${calloutMarker(intent.collapsed ?? false)} ${sanitizeTitle(intent.text, 'Intent')}`)];
  const bodyLines = quoteLines(1, intent.bodyMarkdown ?? intent.detail ?? '');
  const childNextActions = sortByCreatedAt(
    thread.nextActions.filter((item) => item.parentIntentId === intent.id),
  );
  const childBlocks = sortByCreatedAt([
    ...thread.waitingFor.filter((item) => item.parentIntentId === intent.id && !item.satisfied),
    ...thread.interrupts.filter((item) => item.parentIntentId === intent.id && !item.resolved),
  ]);
  const childSparks = sortByCreatedAt(
    thread.sparkContainers.filter((item) => item.parentIntentId === intent.id),
  );

  const content: string[] = [];
  if (bodyLines.length > 0) content.push(...bodyLines);
  for (const action of childNextActions) {
    content.push(quoteLine(1, `- [${action.done ? 'x' : ' '}] ${action.text}`));
  }
  for (const block of childBlocks) {
    if ('kind' in block) {
      content.push(...buildBlockLines(block.title, block.detail, 2));
    } else {
      content.push(...buildBlockLines(block.title, block.content, 2));
    }
  }
  const visited = new Set<string>();
  for (const spark of childSparks) {
    content.push(...renderSparkContainer(thread, spark, 2, visited));
  }

  if (content.length > 0) {
    lines.push(quoteLine(1, ''));
    lines.push(...content);
  }
  return lines;
}

function materializeStructuredSections(thread: WorkThread): string {
  const sections: string[] = [];
  const rootMarkdown = compactMarkdown(thread.rootMarkdown);
  if (rootMarkdown) {
    sections.push(rootMarkdown);
  }

  const rootNextActions = sortByCreatedAt(
    thread.nextActions.filter((item) => !item.parentIntentId && !item.parentSparkId),
  );
  if (rootNextActions.length > 0) {
    sections.push(rootNextActions.map((item) => `- [${item.done ? 'x' : ' '}] ${item.text}`).join('\n'));
  }

  const rootBlocks = sortByCreatedAt([
    ...thread.waitingFor.filter((item) => !item.satisfied && !item.parentIntentId && !item.parentSparkId),
    ...thread.interrupts.filter((item) => !item.resolved && !item.parentIntentId && !item.parentSparkId),
  ]);
  if (rootBlocks.length > 0) {
    const lines: string[] = [];
    for (const block of rootBlocks) {
      if ('kind' in block) {
        lines.push(...buildBlockLines(block.title, block.detail, 1));
      } else {
        lines.push(...buildBlockLines(block.title, block.content, 1));
      }
    }
    sections.push(lines.join('\n'));
  }

  const rootIntents = sortByCreatedAt(
    thread.intents.filter((item) => !item.parentIntentId && !item.parentSparkId),
  );
  if (rootIntents.length > 0) {
    sections.push(rootIntents.map((intent) => renderIntentContainer(thread, intent).join('\n')).join('\n\n'));
  }

  const rootSparks = sortByCreatedAt(
    thread.sparkContainers.filter((item) => !item.parentIntentId && !item.parentSparkId),
  );
  if (rootSparks.length > 0) {
    const visited = new Set<string>();
    sections.push(rootSparks.map((spark) => renderSparkContainer(thread, spark, 1, visited).join('\n')).join('\n\n'));
  }

  const explorationMarkdown = compactMarkdown(thread.explorationMarkdown);
  if (explorationMarkdown) {
    const lines = [quoteLine(1, '[!explore]- Exploration'), quoteLine(1, ''), ...quoteLines(1, explorationMarkdown)];
    sections.push(lines.join('\n'));
  }

  return sections.filter(Boolean).join('\n\n').trim();
}

function countQuoteDepth(line: string): number {
  let depth = 0;
  let index = 0;
  while (line[index] === '>') {
    depth += 1;
    index += 1;
    while (line[index] === ' ') index += 1;
  }
  return depth;
}

function stripQuoteDepth(line: string, depth: number): string {
  let output = line;
  for (let i = 0; i < depth; i += 1) {
    output = output.replace(/^>\s?/, '');
  }
  return output;
}

function parseCalloutHeader(
  line: string,
  depth: number,
): {
  kind: 'intent' | 'spark' | 'block' | 'explore' | 'waiting' | 'interrupt';
  collapsed: boolean;
  title: string;
  subtype?: string;
} | null {
  if (countQuoteDepth(line) !== depth) return null;
  const normalized = stripQuoteDepth(line, depth).trim();
  const match =
    /^\[!(intent|spark|block|explore|waiting|interrupt)(?::([a-z_]+))?\]([+-])?\s*(.*)$/i.exec(
      normalized,
    );
  if (!match) return null;
  const rawKind = match[1]?.toLowerCase();
  const subtype = match[2]?.toLowerCase();
  const marker = match[3];
  const title = (match[4] ?? '').trim();
  if (!rawKind) return null;
  return {
    kind: rawKind as 'intent' | 'spark' | 'block' | 'explore' | 'waiting' | 'interrupt',
    collapsed: marker === '-',
    title,
    subtype,
  };
}

function blockId(prefix: string, title: string, index: number): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${prefix}-${slug || 'item'}-${index}`;
}

function parseStructuredHeadingMetadata(
  line: string,
):
  | {
      type: 'waiting' | 'interrupt';
      kind: string;
      title: string;
    }
  | null {
  const normalized = line.trim();
  const match = STRUCTURED_HEADING_RE.exec(normalized);
  if (!match) return null;
  const rawType = match[1]?.trim().toLowerCase();
  const kind = match[2]?.trim().toLowerCase();
  const title = match[3]?.trim();
  if (!rawType || !kind || !title) return null;
  const type =
    rawType === 'waiting' || rawType === '等待'
      ? 'waiting'
      : rawType === 'interrupt' || rawType === '中断' || rawType === '打断'
        ? 'interrupt'
        : null;
  if (!type) return null;
  return { type, kind, title };
}

function isActionish(text: string): boolean {
  const normalized = normalizeLegacyLine(text);
  return /^(我(现在)?(要|应该|准备|今晚|今天)|优先|然后准备|接下来|目标[:：].+|target[:：].+)/i.test(
    normalized,
  );
}

function isNextish(text: string): boolean {
  const normalized = normalizeLegacyLine(text);
  return /^(我(现在)?(先|要先|得先|应该先|立刻|马上)|先(去|把|装|跑|做|看|搞|试|补|学)|然后去|在开始下一个任务前|开始前|今晚先|今天先)/i.test(
    normalized,
  );
}

function isSparkish(text: string): boolean {
  return /(也想|想整一个|以后再开|待定安装|可能要分出去|可能单开|想玩|准备发布)/.test(
    normalizeLegacyLine(text),
  );
}

function isBlockish(text: string): boolean {
  return /(卡住|卡在|等待|等着|断点|blocked|blocker)/i.test(normalizeLegacyLine(text));
}

function isResourceish(text: string): boolean {
  return /!\[[^\]]*\]\(|https?:\/\/|\[[^\]]+\]\([^)]+\)/.test(text);
}

function isHeadingish(text: string): boolean {
  return /^#{1,6}\s+/.test(text.trim());
}

function isListish(text: string): boolean {
  return /^(\d+\.|[-*])\s+/.test(text.trim());
}

function isTargetHeading(text: string): boolean {
  return /^(target|目标)[:：]?\s*$/i.test(normalizeLegacyLine(text));
}

function normalizeLegacyLine(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/^~~/, '')
    .replace(/~~$/, '')
    .replace(/^\*\*/, '')
    .replace(/\*\*$/, '')
    .replace(/^[:：]\s*/, '')
    .trim();
}

function buildLegacyTitle(text: string): string {
  return normalizeLegacyLine(text)
    .replace(/^(目标|target)[:：]\s*/i, '')
    .replace(/^(断点|卡住)[:：]\s*/i, '')
    .trim();
}

function isPrimaryLegacyLine(text: string): boolean {
  if (isResourceish(text) || isHeadingish(text) || isListish(text) || isTargetHeading(text)) {
    return false;
  }
  return isBlockish(text) || isSparkish(text) || isNextish(text) || isActionish(text);
}

function splitLegacyParagraph(paragraph: string): string[][] {
  const lines = paragraph
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return lines.length ? [lines] : [];

  const groups: string[][] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) {
      groups.push(current);
      current = [];
    }
  };

  for (const line of lines) {
    const lineIsPrimary = isPrimaryLegacyLine(line);
    const currentHasPrimary = current.some((item) => isPrimaryLegacyLine(item));
    const currentIsResourceOnly =
      current.length > 0 && current.every((item) => !isPrimaryLegacyLine(item));

    if (lineIsPrimary && (currentHasPrimary || currentIsResourceOnly)) {
      flush();
      current = [line];
      continue;
    }

    current.push(line);
  }

  flush();
  return groups;
}

function buildNextActionFromMarkdown(
  text: string,
  done: boolean,
  threadId: string,
  parent: { parentIntentId?: string; parentSparkId?: string } = {},
  index = 0,
): WorkThreadNextAction {
  return {
    id: blockId('md-next', text, index),
    text: text.trim(),
    done,
    source: 'user',
    parentThreadId: threadId,
    parentIntentId: parent.parentIntentId,
    parentSparkId: parent.parentSparkId,
    createdAt: Date.now(),
  };
}

function buildWaitingFromMarkdown(
  title: string,
  detail: string | undefined,
  kind: WorkThreadWaitingKind,
  threadId: string,
  parent: { parentIntentId?: string; parentSparkId?: string } = {},
  index = 0,
): WorkThreadWaitingCondition {
  const now = Date.now();
  return {
    id: blockId('md-block', title, index),
    kind,
    title: sanitizeTitle(title, 'Block'),
    detail,
    parentThreadId: threadId,
    parentIntentId: parent.parentIntentId,
    parentSparkId: parent.parentSparkId,
    satisfied: false,
    createdAt: now,
    updatedAt: now,
  };
}

function buildInterruptFromMarkdown(
  title: string,
  detail: string | undefined,
  source: WorkThreadInterruptSource,
  threadId: string,
  parent: { parentIntentId?: string; parentSparkId?: string } = {},
  index = 0,
): WorkThreadInterrupt {
  return {
    id: blockId('md-interrupt', title, index),
    source,
    title: sanitizeTitle(title, 'Block'),
    content: detail,
    parentThreadId: threadId,
    parentIntentId: parent.parentIntentId,
    parentSparkId: parent.parentSparkId,
    capturedAt: Date.now(),
    resolved: false,
  };
}

function parseSection(
  lines: string[],
  threadId: string,
  parent: { parentIntentId?: string; parentSparkId?: string } = {},
): {
  bodyMarkdown: string;
  explorationMarkdown: string;
  intents: WorkThread['intents'];
  sparkContainers: WorkThread['sparkContainers'];
  nextActions: WorkThread['nextActions'];
  waitingFor: WorkThread['waitingFor'];
  interrupts: WorkThread['interrupts'];
} {
  const intents: WorkThread['intents'] = [];
  const sparkContainers: WorkThread['sparkContainers'] = [];
  const nextActions: WorkThread['nextActions'] = [];
  const waitingFor: WorkThread['waitingFor'] = [];
  const interrupts: WorkThread['interrupts'] = [];
  const bodyLines: string[] = [];
  let explorationMarkdown = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const callout = parseCalloutHeader(line, 1);
    if (callout?.kind === 'intent' || callout?.kind === 'spark' || callout?.kind === 'explore' || callout?.kind === 'block' || callout?.kind === 'waiting' || callout?.kind === 'interrupt') {
      const blockLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j] ?? '';
        const nextDepth = countQuoteDepth(nextLine);
        if (nextLine.trim() && nextDepth < 1) break;
        if (!nextLine.trim() && nextDepth === 0) break;
        blockLines.push(stripQuoteDepth(nextLine, 1));
        j += 1;
      }
      if (callout.kind === 'explore') {
        explorationMarkdown = compactMarkdown(blockLines.join('\n'));
      } else if (callout.kind === 'block' || callout.kind === 'waiting') {
        waitingFor.push(
          buildWaitingFromMarkdown(
            callout.title,
            compactMarkdown(blockLines.join('\n')) || undefined,
            (callout.subtype as WorkThreadWaitingKind | undefined) ?? 'external',
            threadId,
            parent,
            waitingFor.length,
          ),
        );
      } else if (callout.kind === 'interrupt') {
        interrupts.push(
          buildInterruptFromMarkdown(
            callout.title,
            compactMarkdown(blockLines.join('\n')) || undefined,
            (callout.subtype as WorkThreadInterruptSource | undefined) ?? 'manual',
            threadId,
            parent,
            interrupts.length,
          ),
        );
      } else {
        if (callout.kind === 'intent') {
          const intentId = blockId('md-intent', callout.title, intents.length);
          const normalizedChild = parseSection(blockLines, threadId, {
            parentIntentId: intentId,
            parentSparkId: parent.parentSparkId,
          });
          intents.push({
            id: intentId,
            text: sanitizeTitle(callout.title, 'Intent'),
            detail: normalizedChild.bodyMarkdown || undefined,
            bodyMarkdown: normalizedChild.bodyMarkdown,
            collapsed: callout.collapsed,
            parentThreadId: threadId,
            parentIntentId: parent.parentIntentId,
            parentSparkId: parent.parentSparkId,
            state: 'active',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          sparkContainers.push(...normalizedChild.sparkContainers);
          nextActions.push(...normalizedChild.nextActions);
          waitingFor.push(...normalizedChild.waitingFor);
          interrupts.push(...normalizedChild.interrupts);
          if (normalizedChild.explorationMarkdown && !explorationMarkdown) {
            explorationMarkdown = normalizedChild.explorationMarkdown;
          }
        } else {
          const sparkId = blockId('md-spark', callout.title, sparkContainers.length);
          const normalizedChild = parseSection(blockLines, threadId, {
            parentIntentId: parent.parentIntentId,
            parentSparkId: sparkId,
          });
          sparkContainers.push({
            id: sparkId,
            title: sanitizeTitle(callout.title, 'Spark'),
            bodyMarkdown: normalizedChild.bodyMarkdown,
            collapsed: callout.collapsed,
            parentThreadId: threadId,
            parentIntentId: parent.parentIntentId,
            parentSparkId: parent.parentSparkId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          sparkContainers.push(...normalizedChild.sparkContainers);
          nextActions.push(...normalizedChild.nextActions);
          waitingFor.push(...normalizedChild.waitingFor);
          interrupts.push(...normalizedChild.interrupts);
        }
      }
      i = j;
      continue;
    }

    const checklistMatch = /^- \[( |x|X)\] (.+)$/.exec(line.trim());
    if (checklistMatch) {
      nextActions.push(
        buildNextActionFromMarkdown(
          checklistMatch[2] ?? '',
          (checklistMatch[1] ?? ' ').toLowerCase() === 'x',
          threadId,
          parent,
          nextActions.length,
        ),
      );
      i += 1;
      continue;
    }

    if (
      /^#{2,6}\s+(focus|notes from stream|spark|waiting|interrupt|next actions?|下一步|等待|中断)\b/i.test(
        line.trim(),
      )
    ) {
      i += 1;
      continue;
    }

    const structuredHeading = parseStructuredHeadingMetadata(line);
    if (structuredHeading) {
      const detailLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j] ?? '';
        if (!nextLine.trim()) {
          detailLines.push(nextLine);
          j += 1;
          continue;
        }
        if (/^#{2,6}\s+/.test(nextLine.trim()) || parseCalloutHeader(nextLine, 1)) break;
        detailLines.push(nextLine);
        j += 1;
      }
      const detail = compactMarkdown(detailLines.join('\n')) || undefined;
      if (structuredHeading.type === 'waiting') {
        waitingFor.push(
          buildWaitingFromMarkdown(
            structuredHeading.title,
            detail,
            structuredHeading.kind as WorkThreadWaitingKind,
            threadId,
            parent,
            waitingFor.length,
          ),
        );
      } else {
        interrupts.push(
          buildInterruptFromMarkdown(
            structuredHeading.title,
            detail,
            structuredHeading.kind as WorkThreadInterruptSource,
            threadId,
            parent,
            interrupts.length,
          ),
        );
      }
      i = j;
      continue;
    }

    bodyLines.push(line);
    i += 1;
  }

  return {
    bodyMarkdown: compactMarkdown(bodyLines.join('\n')),
    explorationMarkdown,
    intents,
    sparkContainers,
    nextActions,
    waitingFor,
    interrupts,
  };
}

function migrateLegacyMarkdown(markdown: string, threadId: string): Omit<WorkThreadMarkdownPatch, 'frontmatter' | 'docMarkdown'> {
  const paragraphs = compactMarkdown(markdown)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const rootChunks: string[] = [];
  const explorationChunks: string[] = [];
  const intents: WorkThread['intents'] = [];
  const sparkContainers: WorkThread['sparkContainers'] = [];
  const nextActions: WorkThread['nextActions'] = [];
  const waitingFor: WorkThread['waitingFor'] = [];
  const interrupts: WorkThread['interrupts'] = [];
  let activeIntentId: string | undefined;

  const appendToIntentBody = (intentId: string | undefined, markdownChunk: string) => {
    if (!intentId) return false;
    const normalizedChunk = compactMarkdown(markdownChunk);
    if (!normalizedChunk) return false;
    const target = intents.find((item) => item.id === intentId);
    if (!target) return false;
    const bodyMarkdown = compactMarkdown(
      [target.bodyMarkdown ?? target.detail ?? '', normalizedChunk].filter(Boolean).join('\n\n'),
    );
    target.bodyMarkdown = bodyMarkdown;
    target.detail = bodyMarkdown || undefined;
    target.updatedAt = Date.now();
    return true;
  };

  for (const paragraph of paragraphs) {
    const groups = splitLegacyParagraph(paragraph);
    for (const group of groups) {
      const lines = group.map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0) continue;
      const firstRaw = lines[0] ?? '';
      const first = normalizeLegacyLine(firstRaw);
      const restRaw = lines.slice(1);
      const restMarkdown = compactMarkdown(restRaw.map((line) => normalizeLegacyLine(line)).join('\n'));
      const groupMarkdown = compactMarkdown(lines.join('\n'));

      if (LEGACY_NEXT_HEADING_RE.test(firstRaw) && lines.length > 1) {
        const checklistLines = lines.slice(1);
        checklistLines.forEach((line, index) => {
          const match = /^[-*]?\s*(.+)$/.exec(normalizeLegacyLine(line));
          if (!match?.[1]) return;
          nextActions.push(
            buildNextActionFromMarkdown(match[1], false, threadId, {}, nextActions.length + index),
          );
        });
        activeIntentId = undefined;
        continue;
      }

      if (
        isTargetHeading(firstRaw) ||
        (isHeadingish(firstRaw) && !isActionish(firstRaw)) ||
        lines.every((line) => isResourceish(line) || isHeadingish(line) || isListish(line))
      ) {
        explorationChunks.push(groupMarkdown);
        activeIntentId = undefined;
        continue;
      }

      if (isBlockish(firstRaw)) {
        waitingFor.push(
          buildWaitingFromMarkdown(
            buildLegacyTitle(first),
            restMarkdown || undefined,
            'external',
            threadId,
            {},
            waitingFor.length,
          ),
        );
        activeIntentId = undefined;
        continue;
      }

      if (isSparkish(firstRaw)) {
        sparkContainers.push({
          id: blockId('legacy-spark', first, sparkContainers.length),
          title: sanitizeTitle(buildLegacyTitle(first), 'Spark'),
          bodyMarkdown: restMarkdown,
          collapsed: false,
          parentThreadId: threadId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        activeIntentId = undefined;
        continue;
      }

      if (isNextish(firstRaw)) {
        nextActions.push(
          buildNextActionFromMarkdown(
            buildLegacyTitle(first),
            false,
            threadId,
            activeIntentId ? { parentIntentId: activeIntentId } : {},
            nextActions.length,
          ),
        );
        if (restMarkdown) {
          if (!appendToIntentBody(activeIntentId, restMarkdown)) {
            rootChunks.push(restMarkdown);
          }
        }
        continue;
      }

      if (isActionish(firstRaw)) {
        const now = Date.now();
        const intentId = blockId('legacy-intent', first, intents.length);
        intents.push({
          id: intentId,
          text: sanitizeTitle(buildLegacyTitle(first), 'Intent'),
          detail: restMarkdown || undefined,
          bodyMarkdown: restMarkdown,
          collapsed: false,
          parentThreadId: threadId,
          state: 'active',
          createdAt: now,
          updatedAt: now,
        });
        activeIntentId = intentId;
        continue;
      }

      if (isResourceish(groupMarkdown) || isHeadingish(firstRaw) || isListish(firstRaw)) {
        if (!appendToIntentBody(activeIntentId, groupMarkdown)) {
          explorationChunks.push(groupMarkdown);
        }
        continue;
      }

      rootChunks.push(groupMarkdown);
      activeIntentId = undefined;
    }
  }

  return {
    rootMarkdown: compactMarkdown(rootChunks.join('\n\n')),
    explorationMarkdown: compactMarkdown(explorationChunks.join('\n\n')),
    intents,
    sparkContainers,
    nextActions,
    waitingFor,
    interrupts,
  };
}

function hasContainerSyntax(markdown: string): boolean {
  return />\s*\[!(intent|spark|block|explore|waiting|interrupt)(?::[a-z_]+)?\]/i.test(markdown);
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
  const frontmatter = parseFrontmatter(frontmatterRaw);
  const normalizedBody = compactMarkdown(body);
  const threadId = frontmatter.id?.trim() || 'md-thread';

  const structured = hasContainerSyntax(normalizedBody)
    ? parseSection(normalizedBody.split('\n'), threadId)
    : migrateLegacyMarkdown(normalizedBody, threadId);

  return {
    frontmatter,
    docMarkdown: normalizedBody,
    rootMarkdown:
      'rootMarkdown' in structured ? structured.rootMarkdown : structured.bodyMarkdown,
    explorationMarkdown: structured.explorationMarkdown,
    intents: structured.intents,
    sparkContainers: structured.sparkContainers,
    nextActions: structured.nextActions,
    waitingFor: structured.waitingFor,
    interrupts: structured.interrupts,
  };
}
