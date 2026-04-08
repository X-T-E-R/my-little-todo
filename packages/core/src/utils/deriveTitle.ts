import type { Task } from '../models/task.js';

export const DERIVE_TITLE_MAX_LEN = 80;

/** First line of body, strip common Markdown line prefixes, truncate for list display. */
export function deriveTitleFromBody(body: string): string {
  const firstLine = body.split(/\r?\n/)[0] ?? '';
  const stripped = firstLine
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+\[[ xX]\]\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^>\s+/, '')
    .trim();
  const line = stripped || firstLine.trim();
  if (!line) return 'Untitled';
  const plain = line.replace(/\*\*|__|`/g, '').trim();
  const base = plain || line;
  return base.length > DERIVE_TITLE_MAX_LEN
    ? `${base.slice(0, DERIVE_TITLE_MAX_LEN - 1)}…`
    : base;
}

/** Title shown in UI: custom title when `titleCustomized`, otherwise derived from body. */
export function displayTaskTitle(task: Pick<Task, 'title' | 'body' | 'titleCustomized'>): string {
  if (task.titleCustomized && task.title.trim()) return task.title.trim();
  return deriveTitleFromBody(task.body);
}
