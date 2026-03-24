import { describe, it, expect } from 'vitest';
import { parseStreamFile, parseTaskFile } from './parser.js';

describe('parseStreamFile', () => {
  const dateKey = '2026-03-22';

  it('parses a basic spark entry with HH:MM:SS format', () => {
    const content = `---
date: ${dateKey}
entries: 1
---

- 14:30:00 | 今天开始写论文了`;

    const entries = parseStreamFile(content, dateKey);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('今天开始写论文了');
    expect(entries[0].entryType).toBe('spark');
    expect(entries[0].id).toBe('se-20260322-143000');
    expect(entries[0].timestamp).toEqual(new Date('2026-03-22T14:30:00'));
  });

  it('parses legacy HH:MM format and pads seconds', () => {
    const content = `- 09:15 | 早起打卡`;
    const entries = parseStreamFile(content, dateKey);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('se-20260322-091500');
    expect(entries[0].timestamp).toEqual(new Date('2026-03-22T09:15:00'));
  });

  it('handles [task] entry type tag', () => {
    const content = `- 10:00:00 | [task] 需要完成报告`;
    const entries = parseStreamFile(content, dateKey);
    expect(entries).toHaveLength(1);
    expect(entries[0].entryType).toBe('task');
    expect(entries[0].content).toBe('需要完成报告');
  });

  it('extracts tags from content', () => {
    const content = `- 11:00:00 | 讨论了 #项目A 和 #urgent 的问题`;
    const entries = parseStreamFile(content, dateKey);
    expect(entries[0].tags).toEqual(['项目A', 'urgent']);
  });

  it('extracts role reference', () => {
    const content = `- 12:00:00 | 开会讨论需求 @role:dev-lead`;
    const entries = parseStreamFile(content, dateKey);
    expect(entries[0].roleId).toBe('dev-lead');
  });

  it('extracts task reference', () => {
    const content = `- 13:00:00 | 完成了任务 → [t-20260320-100000]`;
    const entries = parseStreamFile(content, dateKey);
    expect(entries[0].extractedTaskId).toBe('t-20260320-100000');
    expect(entries[0].content).not.toContain('→');
  });

  it('extracts image attachments', () => {
    const content = `- 14:00:00 | 看到了这个 ![截图](https://example.com/img.png)`;
    const entries = parseStreamFile(content, dateKey);
    expect(entries[0].attachments).toHaveLength(1);
    expect(entries[0].attachments[0].type).toBe('image');
    expect(entries[0].attachments[0].url).toBe('https://example.com/img.png');
  });

  it('generates unique IDs for entries at the same time', () => {
    const content = [
      '- 10:00:00 | 第一条',
      '- 10:00:00 | 第二条',
      '- 10:00:00 | 第三条',
    ].join('\n');
    const entries = parseStreamFile(content, dateKey);
    expect(entries).toHaveLength(3);
    expect(entries[0].id).toBe('se-20260322-100000');
    expect(entries[1].id).toBe('se-20260322-100000-1');
    expect(entries[2].id).toBe('se-20260322-100000-2');
  });

  it('returns empty array for empty content', () => {
    expect(parseStreamFile('', dateKey)).toEqual([]);
  });

  it('skips non-matching lines', () => {
    const content = `---
date: ${dateKey}
---

This is just a comment
- 10:00:00 | valid entry
Another comment`;
    const entries = parseStreamFile(content, dateKey);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('valid entry');
  });
});

describe('parseTaskFile', () => {
  it('parses front matter metadata', () => {
    const content = `---
id: t-20260320-100000
title: 写论文
status: active
created: 2026-03-20T10:00:00.000Z
updated: 2026-03-21T08:00:00.000Z
---

这是任务的正文内容。`;

    const task = parseTaskFile(content);
    expect(task.id).toBe('t-20260320-100000');
    expect(task.title).toBe('写论文');
    expect(task.status).toBe('active');
    expect(task.createdAt).toEqual(new Date('2026-03-20T10:00:00.000Z'));
    expect(task.updatedAt).toEqual(new Date('2026-03-21T08:00:00.000Z'));
    expect(task.body).toBe('这是任务的正文内容。');
  });

  it('parses optional fields when present', () => {
    const content = `---
id: t-1
title: 带DDL的任务
status: today
created: 2026-03-20T10:00:00.000Z
updated: 2026-03-20T10:00:00.000Z
ddl: 2026-04-01T23:59:00.000Z
ddl_type: hard
planned: 2026-03-25T09:00:00.000Z
role: researcher
tags: [论文, urgent]
priority: 5
source: se-20260320-100000
subtasks: [t-2, t-3]
parent: t-0
---
`;

    const task = parseTaskFile(content);
    expect(task.ddl).toEqual(new Date('2026-04-01T23:59:00.000Z'));
    expect(task.ddlType).toBe('hard');
    expect(task.plannedAt).toEqual(new Date('2026-03-25T09:00:00.000Z'));
    expect(task.roleId).toBe('researcher');
    expect(task.tags).toEqual(['论文', 'urgent']);
    expect(task.priority).toBe(5);
    expect(task.sourceStreamId).toBe('se-20260320-100000');
    expect(task.subtaskIds).toEqual(['t-2', 't-3']);
    expect(task.parentId).toBe('t-0');
  });

  it('handles minimal task with only required fields', () => {
    const content = `---
id: t-min
title: 最小任务
status: inbox
created: 2026-03-20T00:00:00.000Z
updated: 2026-03-20T00:00:00.000Z
---
`;
    const task = parseTaskFile(content);
    expect(task.id).toBe('t-min');
    expect(task.tags).toEqual([]);
    expect(task.subtaskIds).toEqual([]);
    expect(task.resources).toEqual([]);
    expect(task.reminders).toEqual([]);
    expect(task.submissions).toEqual([]);
    expect(task.postponements).toEqual([]);
    expect(task.ddl).toBeUndefined();
    expect(task.roleId).toBeUndefined();
    expect(task.body).toBe('');
  });

  it('parses Resources section', () => {
    const content = `---
id: t-res
title: 有资源的任务
status: active
created: 2026-03-20T00:00:00.000Z
updated: 2026-03-20T00:00:00.000Z
---

## Resources

- 2026-03-20 | [link] https://example.com 参考文献
- 2026-03-21 | [note] 一些笔记`;

    const task = parseTaskFile(content);
    expect(task.resources).toHaveLength(2);
    expect(task.resources[0].type).toBe('link');
    expect(task.resources[0].url).toBe('https://example.com');
    expect(task.resources[0].title).toBe('参考文献');
    expect(task.resources[1].type).toBe('note');
    expect(task.resources[1].url).toBeUndefined();
    expect(task.resources[1].title).toBe('一些笔记');
  });

  it('parses Reminders section', () => {
    const content = `---
id: t-rem
title: 有提醒的任务
status: active
created: 2026-03-20T00:00:00.000Z
updated: 2026-03-20T00:00:00.000Z
---

## Reminders

- rem-1 | 2026-03-25T09:00:00.000Z | notified | 交作业
- rem-2 | 2026-03-28T09:00:00.000Z | pending`;

    const task = parseTaskFile(content);
    expect(task.reminders).toHaveLength(2);
    expect(task.reminders[0].id).toBe('rem-1');
    expect(task.reminders[0].notified).toBe(true);
    expect(task.reminders[0].label).toBe('交作业');
    expect(task.reminders[1].id).toBe('rem-2');
    expect(task.reminders[1].notified).toBe(false);
    expect(task.reminders[1].label).toBeUndefined();
  });

  it('skips 暂无 lines in structured sections', () => {
    const content = `---
id: t-empty
title: 空段落
status: inbox
created: 2026-03-20T00:00:00.000Z
updated: 2026-03-20T00:00:00.000Z
---

## Resources

（暂无）

## Reminders

（暂无）`;

    const task = parseTaskFile(content);
    expect(task.resources).toEqual([]);
    expect(task.reminders).toEqual([]);
  });

  it('separates body from structured sections', () => {
    const content = `---
id: t-body
title: 有正文
status: active
created: 2026-03-20T00:00:00.000Z
updated: 2026-03-20T00:00:00.000Z
---

第一行正文
第二行正文

## Resources

（暂无）`;

    const task = parseTaskFile(content);
    expect(task.body).toBe('第一行正文\n第二行正文');
  });
});
