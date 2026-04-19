import { describe, expect, it } from 'vitest';
import { buildWorkThreadSlashInsertion } from './workThreadSlash';

describe('buildWorkThreadSlashInsertion', () => {
  it('builds an intent callout snippet with the title selected', () => {
    const insertion = buildWorkThreadSlashInsertion('intent');
    expect(insertion?.markdown).toBe('> [!intent]+ 意图标题\n>\n> 在这里继续推进这条意图');
    expect(insertion?.selectionText).toBe('意图标题');
    expect(insertion?.markdown.slice(insertion.selectionStart, insertion.selectionEnd)).toBe(
      '意图标题',
    );
  });

  it('builds a next-action checklist snippet', () => {
    const insertion = buildWorkThreadSlashInsertion('next-action');
    expect(insertion?.markdown).toBe('- [ ] 下一步');
    expect(insertion?.selectionText).toBe('下一步');
  });

  it('builds a block callout snippet with a selected title', () => {
    const insertion = buildWorkThreadSlashInsertion('block', {
      blockTitlePlaceholder: '标题',
    });
    expect(insertion?.markdown).toBe('> [!block] 卡点标题\n>\n> 补充卡住原因或前置条件');
    expect(insertion?.selectionText).toBe('卡点标题');
  });

  it('builds a spark callout snippet instead of capture flags', () => {
    const insertion = buildWorkThreadSlashInsertion('spark');
    expect(insertion?.markdown).toBe('> [!spark]+ Spark 标题\n>\n> 在这里展开这个分支想法');
    expect(insertion?.selectionText).toBe('Spark 标题');
  });
});
