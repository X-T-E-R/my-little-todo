import { describe, expect, it } from 'vitest';
import type { WindowContext } from '../models/window-context.js';
import {
  type WindowContextDbRow,
  windowContextFromDbRow,
  windowContextToDbRow,
} from './windowContextRow.js';

function minimalCtx(over: Partial<WindowContext> = {}): WindowContext {
  const now = new Date('2026-04-09T10:00:00.000Z');
  return {
    id: 'wc-1',
    matchMode: 'contains',
    roleIds: ['r1'],
    note: 'note',
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe('windowContextToDbRow / windowContextFromDbRow roundtrip', () => {
  it('preserves fields', () => {
    const c = minimalCtx({
      processName: 'app.exe',
      titlePattern: 'Todo',
      lastMatchedAt: new Date('2026-04-10T00:00:00.000Z'),
    });
    const row = windowContextToDbRow(c);
    const back = windowContextFromDbRow(row as WindowContextDbRow);
    expect(back.id).toBe(c.id);
    expect(back.processName).toBe('app.exe');
    expect(back.titlePattern).toBe('Todo');
    expect(back.matchMode).toBe('contains');
    expect(back.roleIds).toEqual(['r1']);
    expect(back.note).toBe('note');
    expect(back.createdAt.getTime()).toBe(c.createdAt.getTime());
    expect(back.updatedAt.getTime()).toBe(c.updatedAt.getTime());
    expect(back.lastMatchedAt?.getTime()).toBe(c.lastMatchedAt?.getTime());
  });

  it('handles empty role ids JSON', () => {
    const row: WindowContextDbRow = {
      id: 'wc-2',
      process_name: null,
      title_pattern: null,
      match_mode: 'exact',
      role_ids: '[]',
      note: '',
      created_at: 0,
      updated_at: 0,
      last_matched_at: null,
    };
    const back = windowContextFromDbRow(row);
    expect(back.roleIds).toEqual([]);
  });
});
