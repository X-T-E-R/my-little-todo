import { describe, expect, it } from 'vitest';
import { buildWorkThreadSlashInsertion } from './workThreadSlash';

describe('buildWorkThreadSlashInsertion', () => {
  it('builds a mission block snippet with the title selected', () => {
    const insertion = buildWorkThreadSlashInsertion('mission');
    expect(insertion?.markdown).toMatch(
      /^> \[!mission] Mission 标题\n>\n> 写这个 mission 的目标和完成标准。\n\^mlt-mission-[a-z0-9]{8}$/,
    );
    expect(insertion?.selectionText).toBe('Mission 标题');
    expect(insertion?.markdown.slice(insertion.selectionStart, insertion.selectionEnd)).toBe(
      'Mission 标题',
    );
  });

  it('builds a task block snippet', () => {
    const insertion = buildWorkThreadSlashInsertion('task');
    expect(insertion?.markdown).toMatch(
      /^> \[!task] Task 标题\n>\n> 写具体动作。\n\^mlt-task-[a-z0-9]{8}$/,
    );
    expect(insertion?.selectionText).toBe('Task 标题');
  });

  it('builds a log block snippet with a selected title', () => {
    const insertion = buildWorkThreadSlashInsertion('log');
    expect(insertion?.markdown).toMatch(
      /^> \[!log] Log 标题\n>\n> 写过程记录，之后也可以提升到 Stream\.log。\n\^mlt-log-[a-z0-9]{8}$/,
    );
    expect(insertion?.selectionText).toBe('Log 标题');
  });

  it('builds a spark block snippet', () => {
    const insertion = buildWorkThreadSlashInsertion('spark');
    expect(insertion?.markdown).toMatch(
      /^> \[!spark] Spark 标题\n>\n> 在这里展开这个分支想法。\n\^mlt-spark-[a-z0-9]{8}$/,
    );
    expect(insertion?.selectionText).toBe('Spark 标题');
  });
});
