import { describe, expect, it } from 'vitest';
import { DERIVE_TITLE_MAX_LEN, deriveTitleFromBody, displayTaskTitle } from './deriveTitle.js';

describe('deriveTitleFromBody', () => {
  it('returns Untitled for empty body', () => {
    expect(deriveTitleFromBody('')).toBe('Untitled');
  });

  it('strips markdown heading prefix', () => {
    expect(deriveTitleFromBody('## Hello world')).toBe('Hello world');
  });

  it('strips unordered list prefix', () => {
    expect(deriveTitleFromBody('- item one')).toBe('item one');
  });

  it('strips checkbox list prefix', () => {
    expect(deriveTitleFromBody('- [ ] todo')).toBe('todo');
    expect(deriveTitleFromBody('- [x] done')).toBe('done');
  });

  it('strips blockquote prefix', () => {
    expect(deriveTitleFromBody('> quoted line')).toBe('quoted line');
  });

  it('removes bold and code markers for display length', () => {
    expect(deriveTitleFromBody('**bold** and `code`')).toBe('bold and code');
  });

  it('truncates long lines with ellipsis', () => {
    const long = 'a'.repeat(DERIVE_TITLE_MAX_LEN + 10);
    const out = deriveTitleFromBody(long);
    expect(out.length).toBe(DERIVE_TITLE_MAX_LEN);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('displayTaskTitle', () => {
  it('uses custom title when titleCustomized is true', () => {
    expect(
      displayTaskTitle({
        title: '  Custom  ',
        body: 'ignored body line',
        titleCustomized: true,
      }),
    ).toBe('Custom');
  });

  it('derives from body when not customized', () => {
    expect(
      displayTaskTitle({
        title: 'unused',
        body: 'First line of body',
        titleCustomized: false,
      }),
    ).toBe('First line of body');
  });

  it('falls back to derive when customized but title empty', () => {
    expect(
      displayTaskTitle({
        title: '   ',
        body: 'Real content',
        titleCustomized: true,
      }),
    ).toBe('Real content');
  });

  it('shows stored title when not customized, body empty, and title non-empty', () => {
    expect(
      displayTaskTitle({
        title: 'Subtask name',
        body: '',
        titleCustomized: false,
      }),
    ).toBe('Subtask name');
  });
});
