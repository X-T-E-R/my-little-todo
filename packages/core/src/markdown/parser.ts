import type { Attachment, StreamEntry, StreamEntryType } from '../models/stream.js';
import type {
  DdlType,
  KanbanColumn,
  Postponement,
  ProgressLog,
  ProgressLogSource,
  StatusChange,
  Submission,
  Task,
  TaskPhase,
  TaskReminder,
  TaskResource,
  TaskStatus,
} from '../models/task.js';
import {
  ENTRY_TYPE_REGEX,
  IMAGE_REGEX,
  ROLE_REF_REGEX,
  STREAM_LINE_REGEX,
  TAG_REGEX,
  TASK_REF_REGEX,
} from './format.js';

interface FrontMatter {
  [key: string]: unknown;
}

function parseFrontMatter(content: string): { meta: FrontMatter; body: string } {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) return { meta: {}, body: content };

  const meta: FrontMatter = {};
  const lines = fmMatch[1]?.split('\n') ?? [];
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();

    if (value === '') continue;
    if ((value as string).startsWith('[') && (value as string).endsWith(']')) {
      value = (value as string)
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    meta[key] = value;
  }
  return { meta, body: fmMatch[2] ?? '' };
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  const regex = new RegExp(TAG_REGEX.source, TAG_REGEX.flags);
  for (;;) {
    const match = regex.exec(text);
    if (!match) break;
    const tag = match[1];
    if (tag !== undefined) tags.push(tag);
  }
  return tags;
}

function extractAttachments(text: string): Attachment[] {
  const attachments: Attachment[] = [];
  const imgRegex = new RegExp(IMAGE_REGEX.source, IMAGE_REGEX.flags);
  for (;;) {
    const match = imgRegex.exec(text);
    if (!match) break;
    const url = match[2];
    if (url === undefined) continue;
    attachments.push({ type: 'image', url, title: match[1] || undefined });
  }
  return attachments;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: parsing logic requires many branches
export function parseStreamFile(content: string, dateKey: string): StreamEntry[] {
  const { body } = parseFrontMatter(content);
  const entries: StreamEntry[] = [];
  const seenIds = new Map<string, number>();

  for (const line of body.split('\n')) {
    const m = STREAM_LINE_REGEX.exec(line.trim());
    if (!m) continue;

    const time = m[1];
    let rawContent = m[2];
    if (time === undefined || rawContent === undefined) continue;

    let entryType: StreamEntryType = 'spark';
    const typeMatch = ENTRY_TYPE_REGEX.exec(rawContent);
    if (typeMatch) {
      const raw = typeMatch[1] as string;
      entryType = (raw === 'note' || raw === 'journal' ? 'log' : raw) as StreamEntryType;
      rawContent = rawContent.replace(ENTRY_TYPE_REGEX, '');
    }

    const roleMatch = ROLE_REF_REGEX.exec(rawContent);
    const roleId = roleMatch ? roleMatch[1] : undefined;
    if (roleMatch) {
      rawContent = rawContent.replace(ROLE_REF_REGEX, '').trim();
    }

    const tags = extractTags(rawContent);
    const attachments = extractAttachments(rawContent);

    const refMatch = TASK_REF_REGEX.exec(rawContent);
    const extractedTaskId = refMatch ? refMatch[1] : undefined;

    const hasSeconds = time.length === 8;
    const fullTime = hasSeconds ? time : `${time}:00`;
    const timestamp = new Date(`${dateKey}T${fullTime}`);

    const timePart = fullTime.replace(/:/g, '');
    const baseId = `se-${dateKey.replace(/-/g, '')}-${timePart}`;
    const count = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}-${count}`;

    entries.push({
      id,
      content: rawContent.replace(TASK_REF_REGEX, '').trim(),
      timestamp,
      tags,
      attachments,
      extractedTaskId,
      roleId,
      entryType,
    });
  }

  return entries;
}

const STRUCTURED_SECTION_REGEX =
  /^## (Submissions|Postponements|Resources|Reminders|Status History)$/;

function parseResourceLine(line: string): TaskResource | null {
  const trimmed = line.replace(/^- /, '').trim();
  if (!trimmed || trimmed === '（暂无）') return null;

  const pipeIdx = trimmed.indexOf(' | ');
  if (pipeIdx === -1) return null;
  const dateStr = trimmed.slice(0, pipeIdx).trim();
  const rest = trimmed.slice(pipeIdx + 3).trim();

  const urlMatch = rest.match(/^\[(\w+)\]\s*(.+?)(?:\s+(.+))?$/);
  if (urlMatch) {
    return {
      type: (urlMatch[1] as TaskResource['type']) ?? 'note',
      title: urlMatch[3] ?? urlMatch[2] ?? '',
      url: urlMatch[1] === 'note' ? undefined : urlMatch[2],
      addedAt: new Date(dateStr),
    };
  }
  return { type: 'note', title: rest, addedAt: new Date(dateStr) };
}

function parseStatusHistoryLine(line: string): StatusChange | null {
  const trimmed = line.replace(/^- /, '').trim();
  if (!trimmed || trimmed === '（暂无）') return null;
  const parts = trimmed.split(' | ');
  if (parts.length < 2) return null;
  const timestamp = new Date((parts[0] ?? '').trim());
  const transition = (parts[1] ?? '').trim();
  const arrow = transition.split(' → ');
  if (arrow.length !== 2) return null;
  const fromStatus = arrow[0]?.trim();
  const toStatus = arrow[1]?.trim();
  if (!fromStatus || !toStatus) return null;
  return { from: fromStatus as TaskStatus, to: toStatus as TaskStatus, timestamp };
}

function parseReminderLine(line: string): TaskReminder | null {
  const trimmed = line.replace(/^- /, '').trim();
  if (!trimmed || trimmed === '（暂无）') return null;

  const parts = trimmed.split(' | ');
  if (parts.length < 2) return null;
  const id = (parts[0] ?? '').trim();
  const time = (parts[1] ?? '').trim();
  const notified = (parts[2] ?? '').trim() === 'notified';
  const label = (parts[3] ?? '').trim() || undefined;

  return { id, time: new Date(time), notified, label };
}

const KANBAN_COLUMNS: KanbanColumn[] = ['ideas', 'planned', 'doing', 'finishing', 'done_recent'];

function parseProgressLogLine(trimmed: string): ProgressLog | null {
  const m = /^- ([^|]+) \| ([^|]+) \| ([^|]+) \| (.+)$/.exec(trimmed);
  if (!m) return null;
  const id = m[1]?.trim();
  const ts = m[2]?.trim();
  const source = m[3]?.trim() as ProgressLogSource;
  const content = m[4]?.trim() ?? '';
  if (!id || !ts) return null;
  if (source !== 'manual' && source !== 'focus_notes' && source !== 'stream') return null;
  return { id, timestamp: new Date(ts), content, source };
}

function buildTaskFromMeta(
  meta: FrontMatter,
  bodyText: string,
  submissions: Submission[],
  postponements: Postponement[],
  resources: TaskResource[],
  reminders: TaskReminder[],
  statusHistory: StatusChange[],
  progressLogs: ProgressLog[],
): Task {
  const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
  const subtaskIds = Array.isArray(meta.subtasks) ? (meta.subtasks as string[]) : [];

  const rawPhase = meta.phase as string | undefined;
  const phase =
    rawPhase &&
    ['understood', 'exploring', 'working', 'core_done', 'wrapping_up'].includes(rawPhase)
      ? (rawPhase as TaskPhase)
      : undefined;

  const rawCol = meta.kanban_column as string | undefined;
  const kanbanColumn =
    rawCol && KANBAN_COLUMNS.includes(rawCol as KanbanColumn)
      ? (rawCol as KanbanColumn)
      : undefined;

  return {
    id: (meta.id as string) ?? '',
    title: (meta.title as string) ?? '',
    description: meta.description as string | undefined,
    status: (meta.status as TaskStatus) ?? 'inbox',
    createdAt: new Date((meta.created as string) ?? Date.now()),
    updatedAt: new Date((meta.updated as string) ?? (meta.created as string) ?? Date.now()),
    completedAt: meta.completed ? new Date(meta.completed as string) : undefined,
    ddl: meta.ddl ? new Date(meta.ddl as string) : undefined,
    ddlType: meta.ddl_type as DdlType | undefined,
    plannedAt: meta.planned ? new Date(meta.planned as string) : undefined,
    roleId: (meta.role as string | undefined) ?? (meta.project as string | undefined),
    tags,
    priority: meta.priority ? Number(meta.priority) : undefined,
    body: bodyText,
    subtaskIds,
    parentId: meta.parent as string | undefined,
    sourceStreamId: meta.source as string | undefined,
    promoted: meta.promoted === true || meta.promoted === 'true' ? true : undefined,
    resources,
    reminders,
    submissions,
    postponements,
    statusHistory,
    phase,
    progressLogs: progressLogs.length > 0 ? progressLogs : undefined,
    kanbanColumn,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: parsing logic
export function parseTaskFile(content: string): Task {
  const { meta, body } = parseFrontMatter(content);

  const submissions: Submission[] = [];
  const postponements: Postponement[] = [];
  const resources: TaskResource[] = [];
  const reminders: TaskReminder[] = [];
  const statusHistory: StatusChange[] = [];
  const progressLogs: ProgressLog[] = [];

  const bodyLines: string[] = [];
  let section:
    | 'body'
    | 'submissions'
    | 'postponements'
    | 'resources'
    | 'reminders'
    | 'statusHistory'
    | 'progressLogs' = 'body';

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    const headingMatch = STRUCTURED_SECTION_REGEX.exec(trimmed);
    if (headingMatch) {
      const s = headingMatch[1] as string;
      if (s === 'Submissions') section = 'submissions';
      else if (s === 'Postponements') section = 'postponements';
      else if (s === 'Resources') section = 'resources';
      else if (s === 'Reminders') section = 'reminders';
      else if (s === 'Status History') section = 'statusHistory';
      else if (s === 'Progress Logs') section = 'progressLogs';
      continue;
    }
    if (section === 'body') {
      bodyLines.push(line);
    } else if (section === 'progressLogs' && trimmed.startsWith('- ')) {
      const pl = parseProgressLogLine(trimmed);
      if (pl) progressLogs.push(pl);
    } else if (section === 'resources' && trimmed.startsWith('- ')) {
      const r = parseResourceLine(trimmed);
      if (r) resources.push(r);
    } else if (section === 'reminders' && trimmed.startsWith('- ')) {
      const rem = parseReminderLine(trimmed);
      if (rem) reminders.push(rem);
    } else if (section === 'statusHistory' && trimmed.startsWith('- ')) {
      const sh = parseStatusHistoryLine(trimmed);
      if (sh) statusHistory.push(sh);
    }
  }

  const bodyText = bodyLines.join('\n').trim();

  return buildTaskFromMeta(
    meta,
    bodyText,
    submissions,
    postponements,
    resources,
    reminders,
    statusHistory,
    progressLogs,
  );
}
