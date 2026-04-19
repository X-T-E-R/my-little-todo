import { describe, expect, it } from 'vitest';
import {
  findSparkRefDeleteRange,
  formatSparkRefMarkdown,
  parseSparkRefs,
  resolveSparkRefToId,
} from './sparkRefs';

describe('sparkRefs', () => {
  it('formats and parses spark refs with full entry ids', () => {
    const markdown = formatSparkRefMarkdown({
      id: 'se-20260416-120000',
      content: 'A surprisingly long spark title that should be trimmed.',
    });

    expect(markdown).toBe('[[spark:se-20260416-120000|A surprisingly long spark title that should be trimmed.]]');
    expect(parseSparkRefs(`before ${markdown} after`)).toEqual([
      {
        entryId: 'se-20260416-120000',
        displayName: 'A surprisingly long spark title that should be trimmed.',
        fullMatch: '[[spark:se-20260416-120000|A surprisingly long spark title that should be trimmed.]]',
        index: 7,
      },
    ]);
  });

  it('deletes the whole ref when cursor is at the boundary or inside it', () => {
    const markdown = 'todo [[spark:se-1|Investigate mesh stability]] next';
    const from = markdown.indexOf('[[');
    const to = from + '[[spark:se-1|Investigate mesh stability]]'.length;

    expect(findSparkRefDeleteRange(markdown, to, 'backward')).toEqual({ from, to });
    expect(findSparkRefDeleteRange(markdown, from, 'forward')).toEqual({ from, to });
    expect(findSparkRefDeleteRange(markdown, markdown.indexOf('mesh'), 'backward')).toEqual({
      from,
      to,
    });
  });

  it('resolves spark refs back to stream ids', () => {
    expect(
      resolveSparkRefToId('se-20260416-120000', [
        { id: 'se-1' },
        { id: 'se-20260416-120000' },
      ]),
    ).toBe('se-20260416-120000');
  });
});
