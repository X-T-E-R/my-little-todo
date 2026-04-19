import { describe, expect, it } from 'vitest';
import { normalizeLegacyWorkThreadBlocks } from './workThreadLegacyBlocks';

describe('normalizeLegacyWorkThreadBlocks', () => {
  it('rewrites legacy waiting and interrupt blocks into block refs and removes checkpoint sections', () => {
    expect(
      normalizeLegacyWorkThreadBlocks(`> [!waiting:external] title
> detail

## Checkpoint

- Saved at 2026-04-16 10:00

> [!interrupt:manual] ping
> return later`, {
        waitingFor: [{ id: 'w-1', kind: 'external', title: 'title', satisfied: false, createdAt: 1, updatedAt: 1 }],
        interrupts: [{ id: 'i-1', source: 'manual', title: 'ping', resolved: false, capturedAt: 1 }],
      }),
    ).toBe(`[[block:w-1|title]]

[[block:i-1|ping]]`);
  });

  it('rewrites next-action checklists into next refs when a matching runtime action exists', () => {
    expect(
      normalizeLegacyWorkThreadBlocks(`- [ ] First thing
- [x] Done thing`, {
        nextActions: [
          { id: 'n-1', text: 'First thing', done: false, source: 'user', createdAt: 1 },
          { id: 'n-2', text: 'Done thing', done: true, source: 'user', createdAt: 1 },
        ],
      }),
    ).toBe(`[[next:n-1|First thing]]
[[next:n-2|Done thing]]`);
  });
});
