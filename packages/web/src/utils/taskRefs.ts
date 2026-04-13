import type { Task } from '@my-little-todo/core';
import { displayTaskTitle } from '@my-little-todo/core';

export interface ParsedTaskRef {
  shortId: string;
  displayName: string;
  fullMatch: string;
  index: number;
}

export interface TaskRefDeleteRange {
  from: number;
  to: number;
}

const TASK_REF_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,31}$/i;

/** Keep friendly ids like `t2026041`; UUID-like ids still collapse to the first segment. */
export function taskRefShortId(taskId: string): string {
  if (TASK_REF_ID_PATTERN.test(taskId)) return taskId.toLowerCase();
  const seg = taskId.split('-')[0];
  if (seg && TASK_REF_ID_PATTERN.test(seg)) return seg.toLowerCase();
  return taskId.replace(/-/g, '').slice(0, 8).toLowerCase();
}

/** Escape characters that would break the bracket syntax. */
export function sanitizeTaskRefLabel(title: string): string {
  return title.replace(/\|/g, '/').replace(/\]/g, '');
}

export function formatTaskRefMarkdown(
  task: Pick<Task, 'id' | 'title' | 'body' | 'titleCustomized'>,
): string {
  const label = sanitizeTaskRefLabel(displayTaskTitle(task));
  return `[[task:${taskRefShortId(task.id)}|${label}]]`;
}

export function parseTaskRefs(markdown: string): ParsedTaskRef[] {
  const re = /\[\[task:([a-z0-9][a-z0-9_-]{1,31})\|([^\]]+)\]\]/gi;
  const out: ParsedTaskRef[] = [];
  let match = re.exec(markdown);
  while (match !== null) {
    out.push({
      shortId: match[1].toLowerCase(),
      displayName: match[2],
      fullMatch: match[0],
      index: match.index,
    });
    match = re.exec(markdown);
  }
  return out;
}

export function findTaskRefDeleteRange(
  markdown: string,
  cursor: number,
  direction: 'backward' | 'forward',
): TaskRefDeleteRange | null {
  const refs = parseTaskRefs(markdown);
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

/** Resolve short id to full task id; supports both short UUID segments and friendly ids. */
export function resolveTaskRefToId(shortId: string, tasks: Task[]): string | undefined {
  const normalized = shortId.toLowerCase();
  const task = tasks.find((item) => taskRefShortId(item.id) === normalized);
  return task?.id;
}

export function buildRefContextForAi(tasks: Task[], markdown: string): string {
  const refs = parseTaskRefs(markdown);
  if (refs.length === 0) return '';
  const lines: string[] = ['Task references in the note (shortId -> full id):'];
  const seen = new Set<string>();
  for (const ref of refs) {
    const full = resolveTaskRefToId(ref.shortId, tasks);
    if (full && !seen.has(full)) {
      seen.add(full);
      lines.push(`- [[task:${ref.shortId}|${ref.displayName}]] => ${full}`);
    }
  }
  return lines.length > 1 ? `${lines.join('\n')}\n` : '';
}
