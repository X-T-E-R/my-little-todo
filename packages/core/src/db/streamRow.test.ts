import { describe, expect, it } from 'vitest';
import type { StreamEntry } from '../models/stream.js';
import { type StreamEntryDbRow, streamEntryFromDbRow, streamEntryToDbRow } from './streamRow.js';

function minimalEntry(over: Partial<StreamEntry> = {}): StreamEntry {
  return {
    id: 'se-1',
    content: 'hello stream',
    timestamp: new Date('2026-04-09T12:00:00.000Z'),
    tags: [],
    attachments: [],
    entryType: 'spark',
    ...over,
  };
}

describe('streamEntryToDbRow / streamEntryFromDbRow roundtrip', () => {
  it('preserves core fields', () => {
    const e = minimalEntry();
    const row = streamEntryToDbRow(e, 7, null);
    const back = streamEntryFromDbRow(row as StreamEntryDbRow);
    expect(back.id).toBe(e.id);
    expect(back.content).toBe(e.content);
    expect(back.entryType).toBe(e.entryType);
    expect(back.timestamp.getTime()).toBe(e.timestamp.getTime());
  });

  it('preserves tags and attachments', () => {
    const e = minimalEntry({
      tags: ['t1'],
      attachments: [{ type: 'link', url: 'https://x.com', title: 'Link' }],
      roleId: 'role-a',
      extractedTaskId: 't-99',
    });
    const row = streamEntryToDbRow(e, 8, null);
    const back = streamEntryFromDbRow(row as StreamEntryDbRow);
    expect(back.tags).toEqual(['t1']);
    expect(back.attachments).toHaveLength(1);
    expect(back.attachments[0].url).toBe('https://x.com');
    expect(back.roleId).toBe('role-a');
    expect(back.extractedTaskId).toBe('t-99');
  });

  it('preserves thread spark metadata', () => {
    const e = minimalEntry({
      threadMeta: {
        sourceThreadId: 'thread-42',
        sparkState: 'tasked',
        promotedThreadId: 'thread-88',
        linkedTaskId: 'task-9',
        originIntentId: 'intent-7',
      },
    });
    const row = streamEntryToDbRow(e, 9, null);
    const back = streamEntryFromDbRow(row as StreamEntryDbRow);
    expect(back.threadMeta).toEqual({
      sourceThreadId: 'thread-42',
      sparkState: 'tasked',
      promotedThreadId: 'thread-88',
      linkedTaskId: 'task-9',
      originIntentId: 'intent-7',
    });
  });
});
