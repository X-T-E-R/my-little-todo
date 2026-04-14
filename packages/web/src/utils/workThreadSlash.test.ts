import { describe, expect, it } from 'vitest';
import { buildWorkThreadSlashInsertion } from './workThreadSlash';

describe('buildWorkThreadSlashInsertion', () => {
  it('builds next-action as a plain checkbox scaffold', () => {
    expect(buildWorkThreadSlashInsertion('next-action')).toEqual({
      markdown: '- [ ] ',
      selectionStart: 6,
      selectionEnd: 6,
    });
  });

  it('selects the title placeholder for waiting scaffolds', () => {
    const insertion = buildWorkThreadSlashInsertion('waiting');

    expect(insertion?.markdown).toBe('### Waiting · external: title\n\ndetail');
    expect(insertion?.selectionText).toBe('title');
    expect(
      insertion?.markdown.slice(insertion.selectionStart, insertion.selectionEnd),
    ).toBe('title');
  });

  it('marks checkpoint insertions for runtime checkpoint saving', () => {
    const insertion = buildWorkThreadSlashInsertion('checkpoint', {
      checkpointLabel: '2026-04-14 10:00',
    });

    expect(insertion?.shouldSaveCheckpoint).toBe(true);
    expect(insertion?.markdown).toContain('- Saved at 2026-04-14 10:00');
    expect(insertion?.selectionText).toBe('title');
    expect(
      insertion?.markdown.slice(insertion.selectionStart, insertion.selectionEnd),
    ).toBe('title');
  });
});
