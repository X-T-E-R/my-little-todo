import { describe, expect, it } from 'vitest';
import {
  findIntentRefDeleteRange,
  formatIntentRefMarkdown,
  parseIntentRefs,
  resolveIntentRefToId,
} from './intentRefs';

describe('intentRefs', () => {
  it('formats and parses intent refs', () => {
    const markdown = formatIntentRefMarkdown({ id: 'intent-1', text: '先搞清楚 AI 网关怎么配' });
    expect(markdown).toBe('[[intent:intent-1|先搞清楚 AI 网关怎么配]]');
    expect(parseIntentRefs(markdown)).toEqual([
      {
        intentId: 'intent-1',
        displayName: '先搞清楚 AI 网关怎么配',
        fullMatch: '[[intent:intent-1|先搞清楚 AI 网关怎么配]]',
        index: 0,
      },
    ]);
  });

  it('finds delete ranges around refs', () => {
    const markdown = 'before [[intent:intent-1|Explore gateway]] after';
    const cursor = markdown.indexOf(' after');
    expect(findIntentRefDeleteRange(markdown, cursor, 'backward')).toEqual({
      from: 7,
      to: 42,
    });
  });

  it('resolves ids against current intents', () => {
    expect(resolveIntentRefToId('intent-1', [{ id: 'intent-1' }])).toBe('intent-1');
    expect(resolveIntentRefToId('missing', [{ id: 'intent-1' }])).toBeUndefined();
  });
});
