import type { Node as ProseMirrorNode } from '@milkdown/prose/model';
import type { WorkThreadSlashCommandId } from './workThreadSlash';

export type WorkThreadCalloutKind =
  | 'intent'
  | 'spark'
  | 'block'
  | 'explore'
  | 'waiting'
  | 'interrupt';

export interface ParsedWorkThreadCalloutHeader {
  kind: WorkThreadCalloutKind;
  subtype?: string;
  collapsed: boolean;
  title: string;
  prefixText: string;
  markerText: '+' | '-' | '';
}

export type WorkThreadFocusableCalloutKind = 'intent' | 'spark' | 'explore';

export interface WorkThreadContainerPathSegment {
  kind: WorkThreadFocusableCalloutKind;
  index: number;
}

export type WorkThreadEditorFocusContext =
  | { kind: 'root' }
  | { kind: 'exploration'; title?: string; containerPath?: string }
  | { kind: 'intent'; title?: string; containerPath?: string }
  | { kind: 'spark'; title?: string; containerPath?: string };

export interface WorkThreadCalloutDescriptor {
  kind: WorkThreadCalloutKind;
  subtype?: string;
  collapsed: boolean;
  title: string;
  prefixText: string;
  markerText: '+' | '-' | '';
  pos: number;
  end: number;
  depth: number;
  headerFrom: number;
  headerTo: number;
  markerFrom?: number;
  markerTo?: number;
  path?: string;
  badgeLabel: string;
}

const CALLOUT_RE =
  /^\[!(intent|spark|block|explore|waiting|interrupt)(?::([a-z_]+))?\]([+-])?\s*(.*)$/i;

function buildSelection(markdown: string, target?: string): { selectionStart: number; selectionEnd: number } {
  if (!target) {
    return {
      selectionStart: markdown.length,
      selectionEnd: markdown.length,
    };
  }

  const start = markdown.indexOf(target);
  if (start < 0) {
    return {
      selectionStart: markdown.length,
      selectionEnd: markdown.length,
    };
  }

  return {
    selectionStart: start,
    selectionEnd: start + target.length,
  };
}

export function isFocusableWorkThreadCalloutKind(
  kind: WorkThreadCalloutKind,
): kind is WorkThreadFocusableCalloutKind {
  return kind === 'intent' || kind === 'spark' || kind === 'explore';
}

export function formatWorkThreadContainerPath(
  segments: WorkThreadContainerPathSegment[],
): string | undefined {
  if (segments.length === 0) return undefined;
  return segments.map((segment) => `${segment.kind}:${segment.index}`).join('/');
}

export function parseWorkThreadContainerPath(path?: string): WorkThreadContainerPathSegment[] {
  if (!path?.trim()) return [];
  return path
    .split('/')
    .map((segment) => {
      const match = /^(intent|spark|explore):(\d+)$/i.exec(segment.trim());
      if (!match) return null;
      return {
        kind: match[1].toLowerCase() as WorkThreadFocusableCalloutKind,
        index: Number.parseInt(match[2] ?? '0', 10),
      };
    })
    .filter((segment): segment is WorkThreadContainerPathSegment => Boolean(segment));
}

export function getWorkThreadCalloutBadgeLabel(kind: WorkThreadCalloutKind): string {
  if (kind === 'intent') return 'Intent';
  if (kind === 'spark') return 'Spark';
  if (kind === 'explore') return 'Explore';
  return 'Block';
}

export function parseWorkThreadCalloutHeader(text: string): ParsedWorkThreadCalloutHeader | null {
  const normalized = text.trim();
  const match = CALLOUT_RE.exec(normalized);
  if (!match) return null;
  const rawKind = match[1]?.toLowerCase() as WorkThreadCalloutKind | undefined;
  const subtype = match[2]?.toLowerCase();
  const markerText = (match[3] ?? '') as '+' | '-' | '';
  const title = (match[4] ?? '').trim();
  if (!rawKind) return null;
  const titlePrefix = `[!${rawKind}${subtype ? `:${subtype}` : ''}]${markerText}${title ? ' ' : ''}`;
  return {
    kind: rawKind,
    subtype,
    collapsed: markerText === '-',
    title,
    prefixText: titlePrefix,
    markerText,
  };
}

function findFirstTextNode(
  node: ProseMirrorNode,
  nodePos: number,
): { text: string; from: number; to: number } | null {
  let result: { text: string; from: number; to: number } | null = null;
  node.descendants((child, pos) => {
    if (result || !child.isText || !child.text) return false;
    result = {
      text: child.text,
      from: nodePos + 1 + pos,
      to: nodePos + 1 + pos + child.text.length,
    };
    return false;
  });
  return result;
}

function extractCalloutsFromNode(
  node: ProseMirrorNode,
  nodePos: number,
  parentPath: WorkThreadContainerPathSegment[],
  quoteDepth: number,
  descriptors: WorkThreadCalloutDescriptor[],
) {
  const focusableCounts: Record<WorkThreadFocusableCalloutKind, number> = {
    intent: 0,
    spark: 0,
    explore: 0,
  };
  let offset = 0;

  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    const childPos = nodePos + offset + 1;

    if (child.type.name === 'blockquote') {
      const firstText = findFirstTextNode(child, childPos);
      const parsed = firstText ? parseWorkThreadCalloutHeader(firstText.text) : null;
      let nextParentPath = parentPath;

      if (parsed) {
        const markerOffset = parsed.markerText ? parsed.prefixText.indexOf(parsed.markerText) : -1;
        const path = isFocusableWorkThreadCalloutKind(parsed.kind)
          ? [...parentPath, { kind: parsed.kind, index: focusableCounts[parsed.kind]++ }]
          : parentPath;

        descriptors.push({
          ...parsed,
          pos: childPos,
          end: childPos + child.nodeSize,
          depth: quoteDepth + 1,
          headerFrom: firstText?.from ?? childPos,
          headerTo: firstText?.to ?? childPos,
          markerFrom: markerOffset >= 0 ? firstText!.from + markerOffset : undefined,
          markerTo:
            markerOffset >= 0 ? firstText!.from + markerOffset + parsed.markerText.length : undefined,
          path: formatWorkThreadContainerPath(path),
          badgeLabel: getWorkThreadCalloutBadgeLabel(parsed.kind),
        });

        if (isFocusableWorkThreadCalloutKind(parsed.kind)) {
          nextParentPath = path;
        }
      }

      extractCalloutsFromNode(child, childPos, nextParentPath, quoteDepth + 1, descriptors);
      offset += child.nodeSize;
      continue;
    }

    if (child.childCount > 0) {
      extractCalloutsFromNode(child, childPos, parentPath, quoteDepth, descriptors);
    }
    offset += child.nodeSize;
  }
}

export function extractWorkThreadCalloutDescriptors(doc: ProseMirrorNode): WorkThreadCalloutDescriptor[] {
  const descriptors: WorkThreadCalloutDescriptor[] = [];
  extractCalloutsFromNode(doc, -1, [], 0, descriptors);
  return descriptors;
}

export interface WorkThreadBlockSnippet {
  markdown: string;
  selectionStart: number;
  selectionEnd: number;
  selectionText?: string;
}

export function buildWorkThreadBlockSnippet(commandId: WorkThreadSlashCommandId): WorkThreadBlockSnippet | null {
  if (commandId === 'intent') {
    const title = '意图标题';
    const detail = '在这里继续推进这条意图';
    const markdown = `> [!intent]+ ${title}\n>\n> ${detail}`;
    return {
      markdown,
      ...buildSelection(markdown, title),
      selectionText: title,
    };
  }

  if (commandId === 'spark') {
    const title = 'Spark 标题';
    const detail = '在这里展开这个分支想法';
    const markdown = `> [!spark]+ ${title}\n>\n> ${detail}`;
    return {
      markdown,
      ...buildSelection(markdown, title),
      selectionText: title,
    };
  }

  if (commandId === 'next-action') {
    const title = '下一步';
    const markdown = `- [ ] ${title}`;
    return {
      markdown,
      ...buildSelection(markdown, title),
      selectionText: title,
    };
  }

  if (commandId === 'block') {
    const title = '卡点标题';
    const detail = '补充卡住原因或前置条件';
    const markdown = `> [!block] ${title}\n>\n> ${detail}`;
    return {
      markdown,
      ...buildSelection(markdown, title),
      selectionText: title,
    };
  }

  return null;
}

export function deriveWorkThreadEditorFocusFromCallout(
  callout: ParsedWorkThreadCalloutHeader | null,
): WorkThreadEditorFocusContext {
  if (!callout) return { kind: 'root' };
  if (callout.kind === 'explore') {
    return { kind: 'exploration' };
  }
  if (callout.kind === 'intent') {
    return {
      kind: 'intent',
      title: callout.title,
    };
  }
  if (callout.kind === 'spark') {
    return {
      kind: 'spark',
      title: callout.title,
    };
  }
  return { kind: 'root' };
}
