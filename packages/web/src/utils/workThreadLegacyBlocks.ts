import type {
  WorkThreadInterrupt,
  WorkThreadNextAction,
  WorkThreadWaitingCondition,
} from '@my-little-todo/core';
import { formatBlockRefMarkdown } from './blockRefs';
import { formatNextRefMarkdown } from './nextRefs';

function normalizeLineBreaks(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n').replace(/<br\s*\/?>/gi, '\n');
}

function findNextActionByText(text: string, nextActions: WorkThreadNextAction[]): WorkThreadNextAction | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return (
    nextActions.find((action) => action.text.trim() === trimmed) ??
    nextActions.find((action) => action.text.trim().toLowerCase() === trimmed.toLowerCase()) ??
    null
  );
}

function findBlockByTitle(
  title: string,
  waitingFor: WorkThreadWaitingCondition[],
  interrupts: WorkThreadInterrupt[],
): WorkThreadWaitingCondition | WorkThreadInterrupt | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  return (
    waitingFor.find((item) => item.title.trim() === trimmed) ??
    interrupts.find((item) => item.title.trim() === trimmed) ??
    waitingFor.find((item) => item.title.trim().toLowerCase() === trimmed.toLowerCase()) ??
    interrupts.find((item) => item.title.trim().toLowerCase() === trimmed.toLowerCase()) ??
    null
  );
}

export function normalizeLegacyWorkThreadBlocks(
  markdown: string,
  runtime?: {
    nextActions?: WorkThreadNextAction[];
    waitingFor?: WorkThreadWaitingCondition[];
    interrupts?: WorkThreadInterrupt[];
  },
): string {
  const lines = normalizeLineBreaks(markdown).split('\n');
  const normalizedLines: string[] = [];
  const nextActions = runtime?.nextActions ?? [];
  const waitingFor = runtime?.waitingFor ?? [];
  const interrupts = runtime?.interrupts ?? [];
  let i = 0;

  while (i < lines.length) {
    const currentLine = lines[i] ?? '';
    const checklistMatch = /^- \[(?: |x|X)\] (.+)$/.exec(currentLine.trim());
    if (checklistMatch) {
      const action = findNextActionByText(checklistMatch[1] ?? '', nextActions);
      normalizedLines.push(action ? formatNextRefMarkdown(action) : currentLine);
      i += 1;
      continue;
    }

    if (/^##\s+(Checkpoint|检查点)\b/i.test(currentLine.trim())) {
      i += 1;
      while (i < lines.length) {
        const nextLine = lines[i] ?? '';
        const trimmed = nextLine.trim();
        if (
          /^##\s+/.test(trimmed) ||
          /^> \[!(?:waiting|interrupt):/i.test(trimmed) ||
          /^#{3,6}\s+(?:Waiting|等待|Interrupt|打断|中断)\s*[·•|-]/i.test(trimmed)
        ) {
          break;
        }
        i += 1;
      }
      while (normalizedLines.length > 0 && normalizedLines.at(-1)?.trim() === '') {
        normalizedLines.pop();
      }
      continue;
    }

    const waitingMatch = /^> \[!waiting:([^\]]+)\] (.+)$/i.exec(currentLine.trim());
    const interruptMatch = /^> \[!interrupt:([^\]]+)\] (.+)$/i.exec(currentLine.trim());
    const headingMatch =
      /^#{3,6}\s+(?:Waiting|等待|Interrupt|打断|中断)\s*[·•|-]\s*([a-z]+)\s*[:：]\s*(.+)$/i.exec(
        currentLine.trim(),
      );

    if (!waitingMatch && !interruptMatch && !headingMatch) {
      normalizedLines.push(currentLine);
      i += 1;
      continue;
    }

    const title = (
      waitingMatch?.[2] ??
      interruptMatch?.[2] ??
      headingMatch?.[2] ??
      ''
    ).trim();
    const block = findBlockByTitle(title, waitingFor, interrupts);
    if (block) {
      normalizedLines.push(formatBlockRefMarkdown({ id: block.id, title: block.title }));
    } else {
      normalizedLines.push(currentLine);
    }

    let j = i + 1;
    if (waitingMatch || interruptMatch) {
      while (j < lines.length) {
        const detailLine = lines[j] ?? '';
        if (!detailLine.startsWith('> ')) break;
        j += 1;
      }
    } else {
      while (j < lines.length) {
        const detailLine = lines[j] ?? '';
        const trimmed = detailLine.trim();
        if (!trimmed) {
          j += 1;
          continue;
        }
        if (/^#{2,6}\s+/.test(trimmed) || /^> \[!(?:waiting|interrupt):/i.test(trimmed)) {
          break;
        }
        j += 1;
      }
    }
    i = j;
  }

  return normalizedLines
    .join('\n')
    .replace(/(\[\[block:[^\]]+\]\])\n(?=\[\[block:[^\]]+\]\])/g, '$1\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
