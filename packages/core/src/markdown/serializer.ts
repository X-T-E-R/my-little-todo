import type { StreamEntry } from '../models/stream.js';
import type { Task } from '../models/task.js';
import { formatDateKey, formatTimeStorage } from '../utils/date.js';
import { taskRoleIds } from '../utils/taskRoles.js';

export function serializeStreamFile(entries: StreamEntry[], dateKey: string): string {
  const lines: string[] = ['---', `date: ${dateKey}`, `entries: ${entries.length}`, '---', ''];

  const sorted = [...entries].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  for (const entry of sorted) {
    const typeTag = entry.entryType !== 'spark' ? `[${entry.entryType}] ` : '';
    let line = `- ${formatTimeStorage(entry.timestamp)} | ${typeTag}${entry.content}`;
    if (entry.roleId) {
      line += ` @role:${entry.roleId}`;
    }
    if (entry.extractedTaskId) {
      line += ` → [${entry.extractedTaskId}]`;
    }
    lines.push(line);
  }

  return `${lines.join('\n')}\n`;
}

function serializeTaskMetaHeader(task: Task): string[] {
  const meta: string[] = [
    '---',
    `id: ${task.id}`,
    `title: ${task.title}`,
    ...(task.titleCustomized ? (['title_customized: true'] as const) : []),
    `status: ${task.status}`,
    `created: ${task.createdAt.toISOString()}`,
    `updated: ${task.updatedAt.toISOString()}`,
  ];

  if (task.completedAt) meta.push(`completed: ${task.completedAt.toISOString()}`);
  if (task.ddl) meta.push(`ddl: ${task.ddl.toISOString()}`);
  if (task.ddlType) meta.push(`ddl_type: ${task.ddlType}`);
  if (task.plannedAt) meta.push(`planned: ${task.plannedAt.toISOString()}`);
  const rids = taskRoleIds(task);
  if (rids.length > 1) {
    meta.push(`roles: [${rids.map((id) => `"${id}"`).join(', ')}]`);
  } else if (rids.length === 1) {
    meta.push(`role: ${rids[0]}`);
  }
  if (task.tags.length > 0) meta.push(`tags: [${task.tags.join(', ')}]`);
  if (task.priority != null) meta.push(`priority: ${task.priority}`);
  if (task.sourceStreamId) meta.push(`source: ${task.sourceStreamId}`);
  if (task.subtaskIds.length > 0) meta.push(`subtasks: [${task.subtaskIds.join(', ')}]`);
  if (task.parentId) meta.push(`parent: ${task.parentId}`);
  if (task.promoted) meta.push('promoted: true');
  if (task.phase) meta.push(`phase: ${task.phase}`);
  if (task.kanbanColumn) meta.push(`kanban_column: ${task.kanbanColumn}`);
  meta.push('---');
  return meta;
}

function serializeProgressLogsBlock(logs: NonNullable<Task['progressLogs']>): string[] {
  if (!logs || logs.length === 0) return [];
  const body: string[] = ['', '## Progress Logs', ''];
  for (const l of logs) {
    const safe = l.content.replace(/\n/g, ' ');
    body.push(`- ${l.id} | ${l.timestamp.toISOString()} | ${l.source} | ${safe}`);
  }
  return body;
}

function serializeSubmissionsBlock(submissions: Task['submissions']): string[] {
  const body: string[] = ['', '## Submissions', ''];
  if (submissions.length === 0) {
    body.push('（暂无）');
    return body;
  }
  for (const s of submissions) {
    const status = s.onTime ? '准时' : `迟交${s.daysLate ?? '?'}天`;
    body.push(`- ${formatDateKey(s.timestamp)} | ${s.note} | ${status}`);
  }
  return body;
}

function serializePostponementsBlock(postponements: Task['postponements']): string[] {
  const body: string[] = ['', '## Postponements', ''];
  if (postponements.length === 0) {
    body.push('（暂无）');
    return body;
  }
  for (const p of postponements) {
    body.push(
      `- ${formatDateKey(p.timestamp)} | 原定 ${formatDateKey(p.fromDate)} → ${formatDateKey(p.toDate)} | 原因：${p.reason}`,
    );
  }
  return body;
}

function serializeResourcesBlock(resources: Task['resources']): string[] {
  const body: string[] = ['', '## Resources', ''];
  if (resources.length === 0) {
    body.push('（暂无）');
    return body;
  }
  for (const r of resources) {
    const date = formatDateKey(r.addedAt);
    if (r.url) {
      body.push(`- ${date} | [${r.type}] ${r.url} ${r.title}`);
    } else {
      body.push(`- ${date} | [note] ${r.title}`);
    }
  }
  return body;
}

function serializeRemindersBlock(reminders: Task['reminders']): string[] {
  const body: string[] = ['', '## Reminders', ''];
  if (reminders.length === 0) {
    body.push('（暂无）');
    return body;
  }
  for (const r of reminders) {
    const parts = [r.id, r.time.toISOString(), r.notified ? 'notified' : 'pending'];
    if (r.label) parts.push(r.label);
    body.push(`- ${parts.join(' | ')}`);
  }
  return body;
}

function serializeStatusHistoryBlock(history: Task['statusHistory']): string[] {
  if (!history || history.length === 0) return [];
  const body: string[] = ['', '## Status History', ''];
  for (const h of history) {
    body.push(`- ${h.timestamp.toISOString()} | ${h.from} → ${h.to}`);
  }
  return body;
}

export function serializeTaskFile(task: Task): string {
  const meta = serializeTaskMetaHeader(task);

  const bodyContent = task.body.trim();
  const bodyBlock = bodyContent ? `\n${bodyContent}\n` : '';

  const sections = [
    ...serializeResourcesBlock(task.resources),
    ...serializeRemindersBlock(task.reminders),
    ...serializeSubmissionsBlock(task.submissions),
    ...serializePostponementsBlock(task.postponements),
    ...serializeStatusHistoryBlock(task.statusHistory),
    ...serializeProgressLogsBlock(task.progressLogs ?? []),
  ];
  return `${meta.join('\n')}\n${bodyBlock}${sections.join('\n')}\n`;
}
