import type { WorkThread } from '@my-little-todo/core';
import {
  formatWorkThreadContainerPath,
  parseWorkThreadContainerPath,
  parseWorkThreadCalloutHeader,
  type WorkThreadCalloutKind,
} from './workThreadDocSyntax';
import {
  getWorkThreadFocusContainerPath,
  normalizeWorkThreadFocus,
  type WorkThreadWorkspaceFocus,
} from './workThreadFocus';

export type WorkThreadDocInsertKind =
  | 'body'
  | 'intent'
  | 'spark'
  | 'next'
  | 'block';

interface WorkThreadCalloutRange {
  start: number;
  end: number;
  depth: number;
  kind: WorkThreadCalloutKind;
  title: string;
  path?: string;
}

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n').trim();
}

function splitInput(text: string): { title: string; detail: string } {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { title: '', detail: '' };
  }
  const [title = '', ...rest] = normalized.split('\n');
  return {
    title: title.trim(),
    detail: rest.join('\n').trim(),
  };
}

function quotePrefix(depth: number): string {
  return Array.from({ length: depth }, () => '>').join(' ');
}

function quoteLine(depth: number, line: string): string {
  const prefix = quotePrefix(depth);
  return line ? `${prefix} ${line}` : prefix;
}

function quoteLines(depth: number, markdown: string): string[] {
  const normalized = normalizeMarkdown(markdown);
  if (!normalized) return [];
  return normalized.split('\n').map((line) => quoteLine(depth, line));
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

function isQuotedBlankLine(line: string | undefined, depth: number): boolean {
  if (line == null) return false;
  return countQuoteDepth(line) === depth && stripQuoteDepth(line, depth).trim() === '';
}

function appendRootSnippet(markdown: string, snippet: string): string {
  const normalizedDoc = normalizeMarkdown(markdown);
  const normalizedSnippet = normalizeMarkdown(snippet);
  if (!normalizedSnippet) return normalizedDoc;
  if (!normalizedDoc) return normalizedSnippet;
  return `${normalizedDoc}\n\n${normalizedSnippet}`;
}

function buildCalloutLines(
  kind: 'intent' | 'spark' | 'block' | 'explore',
  title: string,
  detail: string,
  depth: number,
): string[] {
  const marker = kind === 'intent' || kind === 'spark' ? '+' : kind === 'explore' ? '-' : '';
  const headerTitle = title.trim() || (kind === 'explore' ? '探索区' : '标题');
  const lines = [quoteLine(depth, `[!${kind}]${marker} ${headerTitle}`)];
  const detailLines = quoteLines(depth, detail);
  if (detailLines.length > 0) {
    lines.push(quoteLine(depth, ''));
    lines.push(...detailLines);
  }
  return lines;
}

function resolveFocusTitle(
  thread: WorkThread,
  focus: WorkThreadWorkspaceFocus,
): { kind: 'intent' | 'spark' | 'exploration' | 'root'; title?: string } {
  const normalizedFocus = normalizeWorkThreadFocus(thread, focus);
  if (normalizedFocus.kind === 'intent') {
    return {
      kind: 'intent',
      title: thread.intents.find((item) => item.id === normalizedFocus.id)?.text,
    };
  }
  if (normalizedFocus.kind === 'spark') {
    return {
      kind: 'spark',
      title: thread.sparkContainers.find((item) => item.id === normalizedFocus.id)?.title,
    };
  }
  if (normalizedFocus.kind === 'exploration') {
    return { kind: 'exploration' };
  }
  return { kind: 'root' };
}

function collectCalloutRanges(
  lines: string[],
  depth = 1,
  start = 0,
  end = lines.length,
  parentPath = '',
): WorkThreadCalloutRange[] {
  const ranges: WorkThreadCalloutRange[] = [];
  const counters = {
    intent: 0,
    spark: 0,
    explore: 0,
  };

  let index = start;
  while (index < end) {
    const header = parseWorkThreadCalloutHeader(stripQuoteDepth(lines[index] ?? '', depth));
    if (!header || countQuoteDepth(lines[index] ?? '') !== depth) {
      index += 1;
      continue;
    }

    let blockEnd = index + 1;
    while (blockEnd < end) {
      const nextLine = lines[blockEnd] ?? '';
      const nextDepth = countQuoteDepth(nextLine);
      if (nextLine.trim() && nextDepth < depth) break;
      if (!nextLine.trim() && nextDepth === 0) break;
      blockEnd += 1;
    }

    const path =
      header.kind === 'intent' || header.kind === 'spark' || header.kind === 'explore'
        ? formatWorkThreadContainerPath([
            ...parseWorkThreadContainerPath(parentPath),
            {
              kind: header.kind,
              index: counters[header.kind]++,
            },
          ])
        : parentPath || undefined;

    ranges.push({
      start: index,
      end: blockEnd,
      depth,
      kind: header.kind,
      title: header.title,
      path,
    });
    ranges.push(...collectCalloutRanges(lines, depth + 1, index + 1, blockEnd, path ?? parentPath));
    index = blockEnd;
  }

  return ranges;
}

function appendIntoCallout(
  markdown: string,
  range: WorkThreadCalloutRange,
  snippetLines: string[],
): string {
  const lines = normalizeMarkdown(markdown).split('\n');
  const insertion: string[] = [];
  const previous = lines[range.end - 1];
  if (!isQuotedBlankLine(previous, range.depth)) {
    insertion.push(quoteLine(range.depth, ''));
  }
  insertion.push(...snippetLines);
  const nextLines = [...lines.slice(0, range.end), ...insertion, ...lines.slice(range.end)];
  return nextLines.join('\n').trim();
}

function buildSnippetLines(
  kind: WorkThreadDocInsertKind,
  text: string,
  containerDepth: number | null,
): string[] {
  const { title, detail } = splitInput(text);
  if (kind === 'body') {
    const depth = containerDepth ?? 0;
    return depth > 0 ? quoteLines(depth, text) : [normalizeMarkdown(text)];
  }
  if (kind === 'next') {
    const line = `- [ ] ${title || '下一步'}`;
    return containerDepth && containerDepth > 0 ? [quoteLine(containerDepth, line)] : [line];
  }
  if (kind === 'intent') {
    return buildCalloutLines('intent', title || '意图', detail, 1);
  }
  if (kind === 'spark') {
    const depth = containerDepth && containerDepth > 0 ? containerDepth + 1 : 1;
    return buildCalloutLines('spark', title || 'Spark', detail, depth);
  }
  const depth = containerDepth && containerDepth > 0 ? containerDepth + 1 : 1;
  return buildCalloutLines('block', title || '卡点', detail, depth);
}

export function insertIntoWorkThreadDoc(
  thread: WorkThread,
  focus: WorkThreadWorkspaceFocus,
  kind: WorkThreadDocInsertKind,
  text: string,
): string {
  const normalizedText = normalizeMarkdown(text);
  if (!normalizedText) return normalizeMarkdown(thread.docMarkdown);

  const normalizedDoc = normalizeMarkdown(thread.docMarkdown);
  const resolvedFocus = resolveFocusTitle(thread, focus);
  const focusPath = getWorkThreadFocusContainerPath(thread, normalizeWorkThreadFocus(thread, focus));
  const docLines = normalizedDoc ? normalizedDoc.split('\n') : [];
  const calloutRanges = collectCalloutRanges(docLines);

  if (kind === 'intent') {
    return appendRootSnippet(normalizedDoc, buildSnippetLines(kind, normalizedText, null).join('\n'));
  }

  if (resolvedFocus.kind === 'exploration') {
    const exploreRange =
      calloutRanges.find((range) => range.kind === 'explore' && range.path === focusPath) ??
      calloutRanges.find((range) => range.kind === 'explore');
    if (kind === 'body') {
      if (exploreRange) {
        return appendIntoCallout(normalizedDoc, exploreRange, buildSnippetLines('body', normalizedText, exploreRange.depth));
      }
      const explorationSnippet = buildCalloutLines('explore', '探索区', normalizedText, 1).join('\n');
      return appendRootSnippet(normalizedDoc, explorationSnippet);
    }
  }

  if (resolvedFocus.kind === 'intent' || resolvedFocus.kind === 'spark') {
    const kindName = resolvedFocus.kind;
    const targetTitle = resolvedFocus.title?.trim().toLowerCase();
    const range =
      (focusPath
        ? calloutRanges.find(
            (candidate) => candidate.kind === kindName && candidate.path === focusPath,
          )
        : null) ??
      calloutRanges.find(
        (candidate) =>
          candidate.kind === kindName &&
          (!targetTitle || candidate.title.trim().toLowerCase() === targetTitle),
      );
    if (range) {
      return appendIntoCallout(
        normalizedDoc,
        range,
        buildSnippetLines(kind, normalizedText, range.depth),
      );
    }
  }

  if (kind === 'body') {
    return appendRootSnippet(normalizedDoc, normalizedText);
  }

  return appendRootSnippet(normalizedDoc, buildSnippetLines(kind, normalizedText, null).join('\n'));
}
