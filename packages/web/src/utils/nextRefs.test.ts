import { describe, expect, it } from 'vitest';
import {
  findNextRefDeleteRange,
  formatNextRefMarkdown,
  parseNextRefs,
  resolveNextRefToId,
} from './nextRefs';

describe('nextRefs', () => {
  it('formats and parses next refs', () => {
    const markdown = formatNextRefMarkdown({
      id: 'next-1',
      text: '先把当前案例完整跑通',
    });

    expect(markdown).toBe('[[next:next-1|先把当前案例完整跑通]]');
    expect(parseNextRefs(markdown)).toEqual([
      {
        actionId: 'next-1',
        displayName: '先把当前案例完整跑通',
        fullMatch: '[[next:next-1|先把当前案例完整跑通]]',
        index: 0,
      },
    ]);
  });

  it('deletes the whole ref when cursor is at the boundary or inside it', () => {
    const markdown = 'todo [[next:next-1|Run benchmark]] later';
    const from = markdown.indexOf('[[');
    const to = from + '[[next:next-1|Run benchmark]]'.length;

    expect(findNextRefDeleteRange(markdown, to, 'backward')).toEqual({ from, to });
    expect(findNextRefDeleteRange(markdown, from, 'forward')).toEqual({ from, to });
    expect(findNextRefDeleteRange(markdown, markdown.indexOf('benchmark'), 'backward')).toEqual({
      from,
      to,
    });
  });

  it('resolves next refs back to current action ids', () => {
    expect(resolveNextRefToId('next-1', [{ id: 'next-1' }])).toBe('next-1');
    expect(resolveNextRefToId('missing', [{ id: 'next-1' }])).toBeUndefined();
  });
});
