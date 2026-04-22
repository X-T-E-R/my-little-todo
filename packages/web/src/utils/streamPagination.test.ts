import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STREAM_PAGE_SIZE,
  clampStreamPageSize,
  getNextStreamWindowDays,
  getRequiredDaysToReachDateKey,
  sliceVisibleStreamEntries,
} from './streamPagination';

describe('streamPagination', () => {
  it('clamps persisted page size values into the supported range', () => {
    expect(clampStreamPageSize(undefined)).toBe(DEFAULT_STREAM_PAGE_SIZE);
    expect(clampStreamPageSize('0')).toBe(1);
    expect(clampStreamPageSize('6')).toBe(6);
    expect(clampStreamPageSize(88)).toBe(50);
  });

  it('takes the newest N entries from the current result set', () => {
    expect(sliceVisibleStreamEntries(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b']);
    expect(sliceVisibleStreamEntries(['a', 'b'], 10)).toEqual(['a', 'b']);
  });

  it('computes how many days are needed to reach the oldest available date', () => {
    const now = new Date(2026, 3, 21, 9, 0, 0);
    expect(getRequiredDaysToReachDateKey('2026-04-21', now)).toBe(1);
    expect(getRequiredDaysToReachDateKey('2026-04-20', now)).toBe(2);
    expect(getRequiredDaysToReachDateKey('2026-03-01', now)).toBe(52);
  });

  it('stops increasing the fetch window once the oldest day is already covered', () => {
    const now = new Date(2026, 3, 21, 9, 0, 0);
    expect(getNextStreamWindowDays(14, '2026-03-01', now)).toBe(28);
    expect(getNextStreamWindowDays(42, '2026-03-01', now)).toBe(52);
    expect(getNextStreamWindowDays(52, '2026-03-01', now)).toBeNull();
  });
});
