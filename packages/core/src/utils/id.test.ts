import { describe, it, expect } from 'vitest';
import { generateId, taskId, streamEntryId, behaviorEventId, stepId } from './id.js';

describe('generateId', () => {
  it('returns string with given prefix', () => {
    const id = generateId('test');
    expect(id).toMatch(/^test-/);
  });

  it('matches format: prefix-YYYYMMDD-HHMMSSmmm', () => {
    const id = generateId('x');
    expect(id).toMatch(/^x-\d{8}-\d{9}$/);
  });

  it('generates unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateId('u')));
    expect(ids.size).toBeGreaterThanOrEqual(1);
  });
});

describe('prefixed ID generators', () => {
  it('taskId starts with t-', () => {
    expect(taskId()).toMatch(/^t-/);
  });

  it('streamEntryId starts with se-', () => {
    expect(streamEntryId()).toMatch(/^se-/);
  });

  it('behaviorEventId starts with be-', () => {
    expect(behaviorEventId()).toMatch(/^be-/);
  });

  it('stepId starts with st-', () => {
    expect(stepId()).toMatch(/^st-/);
  });
});
