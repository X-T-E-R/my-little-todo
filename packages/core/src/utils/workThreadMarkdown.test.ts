import { describe, expect, it } from 'vitest';
import type { WorkThread } from '../models/work-thread.js';
import { parseWorkThreadMarkdown, serializeWorkThreadToMarkdown } from './workThreadMarkdown.js';
import { createWorkThread } from './workThreadRuntime.js';

describe('workThreadMarkdown', () => {
  it('serializes frontmatter and structured sections into markdown', () => {
    const thread: WorkThread = {
      ...createWorkThread({
        title: 'COMSOL case',
        mission: 'Reproduce the COMSOL sample result.',
        lane: 'execution',
      }),
      nextActions: [
        {
          id: 'n-1',
          text: 'Run the sample once',
          done: false,
          source: 'user',
          createdAt: 1,
        },
      ],
      waitingFor: [
        {
          id: 'w-1',
          kind: 'file',
          title: 'Sample export',
          detail: 'Need the fresh result file',
          satisfied: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      interrupts: [
        {
          id: 'i-1',
          source: 'manual',
          title: 'Reply to message',
          content: 'Do it after the run',
          capturedAt: 1,
          resolved: false,
        },
      ],
      docMarkdown: '## Focus\n\n[[task:t1|Sample task]]',
    };

    const markdown = serializeWorkThreadToMarkdown(thread);
    expect(markdown).toContain('title: "COMSOL case"');
    expect(markdown).toContain('- [ ] Run the sample once');
    expect(markdown).toContain('### Waiting · file: Sample export');
    expect(markdown).toContain('### Interrupt · manual: Reply to message');
  });

  it('parses markdown into editable runtime patches', () => {
    const patch = parseWorkThreadMarkdown(`---
id: "t-1"
title: "Gateway thread"
mission: "Ship the gateway sketch"
status: ready
lane: research
roleId: "arch"
---

## Focus

[[task:gw1|Gateway]]

## Next Actions

- [ ] Draft the comparison
- [x] Collect examples

## Waiting

### Waiting · person: Product answer

Need final wording

## Interrupts

### Interrupt · manual: Inbox ping

Capture and return
`);

    expect(patch.frontmatter.title).toBe('Gateway thread');
    expect(patch.frontmatter.roleId).toBe('arch');
    expect(patch.nextActions).toHaveLength(2);
    expect(patch.nextActions[1]?.done).toBe(true);
    expect(patch.waitingFor[0]?.kind).toBe('person');
    expect(patch.interrupts[0]?.source).toBe('manual');
  });
});
