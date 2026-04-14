import { describe, expect, it } from 'vitest';
import { isMilkdownSlashMenuClassName } from './richMarkdownNativeSlash';

describe('isMilkdownSlashMenuClassName', () => {
  it('matches the native crepe slash menu class', () => {
    expect(isMilkdownSlashMenuClassName('menu milkdown-slash-menu visible')).toBe(true);
  });

  it('ignores unrelated class names', () => {
    expect(isMilkdownSlashMenuClassName('task-ref-autocomplete-panel')).toBe(false);
    expect(isMilkdownSlashMenuClassName(undefined)).toBe(false);
  });
});
