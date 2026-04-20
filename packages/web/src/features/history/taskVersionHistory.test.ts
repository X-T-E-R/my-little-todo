import { describe, expect, it } from 'vitest';

import type { AuditEventRecord, EntityRevisionRecord } from '../../storage/dataStore';
import {
  buildTaskHistoryItems,
  formatTaskHistoryValue,
  parseTaskHistorySnapshot,
} from './taskVersionHistory';

function buildRevision(
  overrides: Partial<EntityRevisionRecord> & { snapshotJson: string },
): EntityRevisionRecord {
  return {
    id: overrides.id ?? 'rev-1',
    eventId: overrides.eventId ?? 'evt-1',
    groupId: overrides.groupId ?? 'group-1',
    userId: overrides.userId ?? 'local-desktop-user',
    entityType: overrides.entityType ?? 'tasks',
    entityId: overrides.entityId ?? 'task-1',
    entityVersion: overrides.entityVersion ?? 1,
    globalVersion: overrides.globalVersion ?? 1,
    op: overrides.op ?? 'upsert',
    changedAt: overrides.changedAt ?? 1000,
    snapshotJson: overrides.snapshotJson,
  };
}

function buildEvent(overrides: Partial<AuditEventRecord>): AuditEventRecord {
  return {
    id: overrides.id ?? 'evt-1',
    groupId: overrides.groupId ?? 'group-1',
    userId: overrides.userId ?? 'local-desktop-user',
    entityType: overrides.entityType ?? 'tasks',
    entityId: overrides.entityId ?? 'task-1',
    entityVersion: overrides.entityVersion ?? 1,
    globalVersion: overrides.globalVersion ?? 1,
    action: overrides.action ?? 'upsert_task',
    sourceKind: overrides.sourceKind ?? 'desktop-ui',
    actorType: overrides.actorType ?? 'local-user',
    actorId: overrides.actorId ?? 'local-desktop-user',
    occurredAt: overrides.occurredAt ?? 1000,
    summaryJson: overrides.summaryJson ?? null,
  };
}

describe('taskVersionHistory', () => {
  it('parses hydrated task snapshots', () => {
    const snapshot = parseTaskHistorySnapshot(
      JSON.stringify({
        title: 'Write plan',
        status: 'active',
        body: 'Body text',
        planned_at: 123,
        ddl: 456,
        role_ids: ['writer'],
        tags: ['planning'],
        reminders: [{ id: 'r1' }],
        resources: [{ type: 'note', title: 'Doc' }],
        subtask_ids: ['a', 'b'],
      }),
    );

    expect(snapshot).toMatchObject({
      title: 'Write plan',
      status: 'active',
      plannedAt: 123,
      ddl: 456,
      roles: ['writer'],
      tags: ['planning'],
      reminderCount: 1,
      resourceCount: 1,
      subtaskCount: 2,
    });
  });

  it('builds diff items and matches audit events by group id', () => {
    const revisions = [
      buildRevision({
        id: 'rev-2',
        eventId: 'evt-2',
        groupId: 'group-2',
        entityVersion: 2,
        globalVersion: 2,
        changedAt: 2000,
        snapshotJson: JSON.stringify({
          title: 'Write plan',
          status: 'completed',
          body: 'Final body',
          role_ids: ['writer'],
          tags: ['planning', 'done'],
          subtask_ids: [],
          reminders: [],
          resources: [],
        }),
      }),
      buildRevision({
        snapshotJson: JSON.stringify({
          title: 'Write plan',
          status: 'active',
          body: 'Draft body',
          role_ids: ['writer'],
          tags: ['planning'],
          subtask_ids: [],
          reminders: [],
          resources: [],
        }),
      }),
    ];
    const events = [buildEvent({ id: 'evt-2', groupId: 'group-2', action: 'complete_task' })];

    const items = buildTaskHistoryItems(revisions, events);

    expect(items[0].event?.action).toBe('complete_task');
    expect(items[0].changes.map((change) => change.field)).toEqual(['status', 'body', 'tags']);
  });

  it('formats body values into readable previews', () => {
    const formatted = formatTaskHistoryValue(
      'body',
      'This is a long task body that should remain readable when shown inside the version history diff panel.',
    );

    expect(formatted.length).toBeLessThanOrEqual(121);
    expect(formatted).toContain('This is a long task body');
  });
});
