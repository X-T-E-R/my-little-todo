import { describe, expect, it } from 'vitest';
import { findTaskRefDeleteRange, parseTaskRefs } from './taskRefs';

describe('taskRefs', () => {
  it('parses task refs from markdown', () => {
    expect(parseTaskRefs('before [[task:abc123|Do thing]] after')).toEqual([
      {
        shortId: 'abc123',
        displayName: 'Do thing',
        fullMatch: '[[task:abc123|Do thing]]',
        index: 7,
      },
    ]);
  });

  it('deletes the whole ref when backspacing at the end', () => {
    const markdown = 'todo [[task:abc123|Do thing]] next';
    const cursor = markdown.indexOf(' next');
    expect(findTaskRefDeleteRange(markdown, cursor, 'backward')).toEqual({
      from: 5,
      to: cursor,
    });
  });

  it('deletes the whole ref when deleting at the start', () => {
    const markdown = 'todo [[task:abc123|Do thing]] next';
    const from = markdown.indexOf('[[');
    const to = from + '[[task:abc123|Do thing]]'.length;
    expect(findTaskRefDeleteRange(markdown, from, 'forward')).toEqual({
      from,
      to,
    });
  });

  it('deletes the whole ref when cursor lands inside the hidden source token', () => {
    const markdown = 'todo [[task:abc123|Do thing]] next';
    const inside = markdown.indexOf('Do thing');
    expect(findTaskRefDeleteRange(markdown, inside, 'backward')).toEqual({
      from: 5,
      to: 29,
    });
  });
});
