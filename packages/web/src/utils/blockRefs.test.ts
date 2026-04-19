import { describe, expect, it } from 'vitest';
import {
  findBlockRefDeleteRange,
  formatBlockRefMarkdown,
  parseBlockRefs,
  resolveBlockRefToId,
} from './blockRefs';

describe('blockRefs', () => {
  it('formats and parses block refs', () => {
    const markdown = formatBlockRefMarkdown({
      id: 'block-1',
      title: '等 Codex 那边结果回来',
    });

    expect(markdown).toBe('[[block:block-1|等 Codex 那边结果回来]]');
    expect(parseBlockRefs(markdown)).toEqual([
      {
        blockId: 'block-1',
        displayName: '等 Codex 那边结果回来',
        fullMatch: '[[block:block-1|等 Codex 那边结果回来]]',
        index: 0,
      },
    ]);
  });

  it('deletes the whole ref when cursor is at the boundary or inside it', () => {
    const markdown = 'before [[block:block-1|Need product reply]] after';
    const from = markdown.indexOf('[[');
    const to = from + '[[block:block-1|Need product reply]]'.length;

    expect(findBlockRefDeleteRange(markdown, to, 'backward')).toEqual({ from, to });
    expect(findBlockRefDeleteRange(markdown, from, 'forward')).toEqual({ from, to });
    expect(findBlockRefDeleteRange(markdown, markdown.indexOf('product'), 'backward')).toEqual({
      from,
      to,
    });
  });

  it('resolves block refs back to current block ids', () => {
    expect(resolveBlockRefToId('block-1', [{ id: 'block-1' }])).toBe('block-1');
    expect(resolveBlockRefToId('missing', [{ id: 'block-1' }])).toBeUndefined();
  });
});
