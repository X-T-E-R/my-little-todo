import { describe, expect, it } from 'vitest';
import { parseSqliteTimestamp, requireSqliteTimestamp } from './sqliteTimestamp';

describe('sqliteTimestamp', () => {
  it('keeps millisecond timestamps as-is', () => {
    expect(parseSqliteTimestamp(1776018799491)).toBe(1776018799491);
    expect(parseSqliteTimestamp('1776018799491')).toBe(1776018799491);
  });

  it('parses sqlite datetime text', () => {
    expect(parseSqliteTimestamp('2026-04-20 18:52:38')).toBe(Date.parse('2026-04-20T18:52:38Z'));
    expect(parseSqliteTimestamp('2026-04-20 16:49:08')).toBe(Date.parse('2026-04-20T16:49:08Z'));
  });

  it('returns null for invalid timestamps', () => {
    expect(parseSqliteTimestamp('')).toBeNull();
    expect(parseSqliteTimestamp('not-a-date')).toBeNull();
  });

  it('uses fallback when required', () => {
    expect(requireSqliteTimestamp(undefined, 42)).toBe(42);
  });
});
