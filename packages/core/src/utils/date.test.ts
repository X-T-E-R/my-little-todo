import { describe, it, expect } from 'vitest';
import {
  formatDateKey,
  formatTime,
  formatTimeStorage,
  startOfDay,
  endOfDay,
  daysUntil,
  daysBetween,
  isOverdue,
} from './date.js';

describe('formatDateKey', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(formatDateKey(new Date('2026-03-22T14:30:00.000Z'))).toBe('2026-03-22');
  });
});

describe('formatTime', () => {
  it('returns HH:MM format', () => {
    const d = new Date('2026-03-22T14:30:45');
    expect(formatTime(d)).toBe('14:30');
  });
});

describe('formatTimeStorage', () => {
  it('returns HH:MM:SS format', () => {
    const d = new Date('2026-03-22T14:30:45');
    expect(formatTimeStorage(d)).toBe('14:30:45');
  });
});

describe('startOfDay', () => {
  it('sets time to 00:00:00.000', () => {
    const result = startOfDay(new Date('2026-03-22T14:30:45.123'));
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('does not mutate original date', () => {
    const original = new Date('2026-03-22T14:30:00');
    startOfDay(original);
    expect(original.getHours()).toBe(14);
  });
});

describe('endOfDay', () => {
  it('sets time to 23:59:59.999', () => {
    const result = endOfDay(new Date('2026-03-22T08:00:00'));
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
    expect(result.getMilliseconds()).toBe(999);
  });

  it('does not mutate original date', () => {
    const original = new Date('2026-03-22T08:00:00');
    endOfDay(original);
    expect(original.getHours()).toBe(8);
  });
});

describe('daysUntil', () => {
  it('returns positive days for future dates', () => {
    const from = new Date('2026-03-20T00:00:00');
    const target = new Date('2026-03-25T00:00:00');
    expect(daysUntil(target, from)).toBe(5);
  });

  it('returns negative days for past dates', () => {
    const from = new Date('2026-03-25T00:00:00');
    const target = new Date('2026-03-20T00:00:00');
    expect(daysUntil(target, from)).toBe(-5);
  });

  it('returns 0 for same date', () => {
    const d = new Date('2026-03-22T00:00:00');
    expect(daysUntil(d, d)).toBe(0);
  });
});

describe('daysBetween', () => {
  it('returns absolute days between two dates', () => {
    const a = new Date('2026-03-20T00:00:00');
    const b = new Date('2026-03-25T00:00:00');
    expect(daysBetween(a, b)).toBe(5);
    expect(daysBetween(b, a)).toBe(5);
  });
});

describe('isOverdue', () => {
  it('returns true when DDL is in the past', () => {
    const ddl = new Date('2026-03-20T00:00:00');
    const now = new Date('2026-03-22T00:00:00');
    expect(isOverdue(ddl, now)).toBe(true);
  });

  it('returns false when DDL is in the future', () => {
    const ddl = new Date('2026-03-25T00:00:00');
    const now = new Date('2026-03-22T00:00:00');
    expect(isOverdue(ddl, now)).toBe(false);
  });

  it('returns false when DDL is exactly now', () => {
    const d = new Date('2026-03-22T00:00:00');
    expect(isOverdue(d, d)).toBe(false);
  });
});
