import { describe, expect, it } from 'vitest';

import {
  findMissingDesktopHostColumns,
  formatDesktopHostCompatibilityRepairMessage,
  needsDesktopHostCompatibilityRepair,
} from './sqliteDesktopHostCompatibility';

describe('sqliteDesktopHostCompatibility', () => {
  it('detects missing user-scoped columns on upgraded local databases', () => {
    const missing = findMissingDesktopHostColumns({
      tasks: ['id', 'title'],
      stream_entries: ['id', 'content'],
      settings: ['key', 'value'],
      blobs: ['id', 'mime_type'],
    });

    expect(missing).toEqual([
      'tasks.user_id',
      'stream_entries.user_id',
      'settings.user_id',
      'blobs.owner',
    ]);
  });

  it('forces a compatibility repair when schema_version looks new but columns are absent', () => {
    const missing = ['tasks.user_id'];

    expect(needsDesktopHostCompatibilityRepair(17, missing)).toBe(true);
    expect(formatDesktopHostCompatibilityRepairMessage(17, missing)).toContain(
      'missing columns=tasks.user_id',
    );
  });

  it('skips repair only when schema_version is current and columns are present', () => {
    expect(needsDesktopHostCompatibilityRepair(17, [])).toBe(false);
  });
});
