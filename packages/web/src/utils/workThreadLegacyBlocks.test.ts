import { describe, expect, it } from 'vitest';
import { normalizeLegacyWorkThreadBlocks } from './workThreadLegacyBlocks';

describe('normalizeLegacyWorkThreadBlocks', () => {
  it('rewrites legacy waiting and interrupt callouts into heading-based blocks', () => {
    expect(
      normalizeLegacyWorkThreadBlocks(`> [!waiting:external] title
> detail

> [!interrupt:manual] ping
> return later`, {
        waitingHeading: '等待',
        interruptHeading: '打断',
      }),
    ).toBe(`### 等待 · external: title

detail

### 打断 · manual: ping

return later`);
  });
});
