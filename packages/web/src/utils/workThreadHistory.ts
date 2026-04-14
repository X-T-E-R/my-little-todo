import { markdownToPlainText, type WorkThreadEvent } from '@my-little-todo/core';

export type WorkThreadHistoryMode = 'restore' | 'timeline';

export interface WorkThreadHistoryItem {
  id: string;
  title: string;
  summary: string | null;
  metaLabel: string;
  createdAt: number;
  type: WorkThreadEvent['type'];
}

export interface WorkThreadRestoreHistory {
  captures: WorkThreadHistoryItem[];
  decisions: WorkThreadHistoryItem[];
  nextSteps: WorkThreadHistoryItem[];
  blockers: WorkThreadHistoryItem[];
}

type HistoryTranslator = (key: string, options?: Record<string, unknown>) => string;

function tx(
  t: HistoryTranslator | undefined,
  key: string,
  fallback: string,
  options?: Record<string, unknown>,
): string {
  if (!t) return fallback;
  return t(key, { defaultValue: fallback, ...options });
}

function extractTitleSuffix(title: string, prefix: string): string | null {
  return title.startsWith(prefix) ? title.slice(prefix.length).trim() : null;
}

function translateStatus(status: string, t?: HistoryTranslator): string {
  const fallbackMap: Record<string, string> = {
    running: 'Running',
    ready: 'Ready',
    waiting: 'Waiting',
    blocked: 'Blocked',
    sleeping: 'Sleeping',
    done: 'Done',
    archived: 'Archived',
  };
  return tx(t, `thread_status_${status}`, fallbackMap[status] ?? status);
}

function clampSummary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

export function summarizeWorkThreadEventDetail(
  event: WorkThreadEvent,
  maxLength = 140,
): string | null {
  const detail = markdownToPlainText(event.detailMarkdown ?? '').trim();
  if (!detail) return null;
  return clampSummary(detail, maxLength);
}

export function getWorkThreadEventMetaLabel(
  event: WorkThreadEvent,
  t?: HistoryTranslator,
): string {
  const source = typeof event.payload?.source === 'string' ? event.payload.source : null;

  if (event.type === 'raw_capture_added' && source) {
    return tx(t, 'thread_history_meta_capture_source', `capture · ${source}`, { source });
  }
  if (event.type === 'thread_resumed' || event.type === 'thread_dispatched') {
    return tx(t, 'thread_history_meta_resume', 'resume');
  }
  if (event.type === 'checkpoint_saved') {
    return tx(t, 'thread_history_meta_checkpoint', 'checkpoint');
  }
  if (event.type === 'waiting_updated') {
    return tx(t, 'thread_history_meta_waiting', 'waiting');
  }
  if (event.type === 'interrupt_captured') {
    return tx(t, 'thread_history_meta_interrupt', 'interrupt');
  }
  if (event.type === 'next_action_added') {
    return tx(t, 'thread_history_meta_next_step', 'next step');
  }
  if (event.type === 'decision_recorded') {
    return tx(t, 'thread_history_meta_decision', 'decision');
  }
  if (event.type === 'context_added') {
    return tx(t, 'thread_history_meta_context', 'context');
  }
  if (event.type === 'task_created') {
    return tx(t, 'thread_history_meta_task', 'task');
  }
  if (event.type === 'task_linked') {
    return tx(t, 'thread_history_meta_linked_task', 'linked task');
  }
  if (event.type === 'status_changed') {
    return tx(t, 'thread_history_meta_status', 'status');
  }

  return event.type.replace(/_/g, ' ');
}

export function getWorkThreadEventDisplayTitle(
  event: WorkThreadEvent,
  t?: HistoryTranslator,
): string {
  if (event.type === 'raw_capture_added') {
    const source = typeof event.payload?.source === 'string' ? event.payload.source : undefined;
    return tx(t, 'thread_history_event_capture', 'Captured note', { source });
  }

  if (event.type === 'checkpoint_saved') {
    return tx(t, 'thread_history_event_checkpoint', 'Saved checkpoint');
  }

  if (event.type === 'thread_resumed') {
    return tx(t, 'thread_history_event_resumed', 'Resumed thread');
  }

  if (event.type === 'thread_dispatched') {
    return tx(t, 'thread_history_event_dispatched', 'Dispatched thread');
  }

  if (event.type === 'waiting_updated') {
    const title = extractTitleSuffix(event.title, 'Added waiting condition:');
    if (title) {
      return tx(t, 'thread_history_event_waiting_added', `Waiting: ${title}`, { title });
    }
    return tx(t, 'thread_history_event_waiting_updated', 'Updated waiting condition');
  }

  if (event.type === 'interrupt_captured') {
    const title = extractTitleSuffix(event.title, 'Captured interrupt:');
    if (title) {
      return tx(t, 'thread_history_event_interrupt_captured', `Interrupt: ${title}`, { title });
    }
    return tx(t, 'thread_history_event_interrupt_updated', 'Updated interrupt');
  }

  if (event.type === 'next_action_added') {
    const title = extractTitleSuffix(event.title, 'Added next action:');
    if (title) {
      return tx(t, 'thread_history_event_next_step_added', `Next step: ${title}`, { title });
    }
    return tx(t, 'thread_history_event_next_step_updated', 'Updated next step');
  }

  if (event.type === 'task_created') {
    const title = extractTitleSuffix(event.title, 'Created task from thread:');
    if (title) {
      return tx(t, 'thread_history_event_task_created', `Created task: ${title}`, { title });
    }
    return tx(t, 'thread_history_event_task_created_generic', 'Created task');
  }

  if (event.type === 'task_linked') {
    const title = extractTitleSuffix(event.title, 'Linked task:');
    if (title) {
      return tx(t, 'thread_history_event_task_linked', `Linked task: ${title}`, { title });
    }
    return tx(t, 'thread_history_event_task_linked_generic', 'Linked task');
  }

  if (event.type === 'status_changed') {
    const nextStatus = extractTitleSuffix(event.title, 'Status changed to ');
    if (nextStatus) {
      return tx(t, 'thread_history_event_status_changed', `Status: ${translateStatus(nextStatus, t)}`, {
        status: translateStatus(nextStatus, t),
      });
    }
    return tx(t, 'thread_history_event_status_changed_generic', 'Updated status');
  }

  if (event.type === 'resume_card_updated') {
    return tx(t, 'thread_history_event_resume_card', 'Updated resume card');
  }

  if (event.type === 'decision_recorded') {
    return event.title || tx(t, 'thread_history_event_decision', 'Recorded decision');
  }

  if (event.type === 'context_added') {
    return event.title || tx(t, 'thread_history_event_context', 'Added context');
  }

  return event.title;
}

function sortNewestFirst(events: WorkThreadEvent[]): WorkThreadEvent[] {
  return [...events].sort((left, right) => right.createdAt - left.createdAt);
}

function toHistoryItem(event: WorkThreadEvent, t?: HistoryTranslator): WorkThreadHistoryItem {
  return {
    id: event.id,
    title: getWorkThreadEventDisplayTitle(event, t),
    summary: summarizeWorkThreadEventDetail(event),
    metaLabel: getWorkThreadEventMetaLabel(event, t),
    createdAt: event.createdAt,
    type: event.type,
  };
}

function takeNewest(items: WorkThreadHistoryItem[], limit: number): WorkThreadHistoryItem[] {
  return items.slice(0, limit);
}

export function buildWorkThreadTimelineItems(
  events: WorkThreadEvent[],
  limit = 12,
  t?: HistoryTranslator,
): WorkThreadHistoryItem[] {
  return takeNewest(
    sortNewestFirst(events).map((event) => toHistoryItem(event, t)),
    limit,
  );
}

export function buildWorkThreadRestoreHistory(
  events: WorkThreadEvent[],
  limitPerGroup = 4,
  t?: HistoryTranslator,
): WorkThreadRestoreHistory {
  const groups: WorkThreadRestoreHistory = {
    captures: [],
    decisions: [],
    nextSteps: [],
    blockers: [],
  };

  for (const event of sortNewestFirst(events)) {
    const item = toHistoryItem(event, t);

    if (event.type === 'raw_capture_added' || event.type === 'context_added') {
      groups.captures.push(item);
      continue;
    }

    if (
      event.type === 'next_action_added' ||
      event.type === 'task_created' ||
      event.type === 'task_linked' ||
      event.type === 'working_set_updated'
    ) {
      groups.nextSteps.push(item);
      continue;
    }

    if (event.type === 'waiting_updated' || event.type === 'interrupt_captured') {
      groups.blockers.push(item);
      continue;
    }

    groups.decisions.push(item);
  }

  return {
    captures: takeNewest(groups.captures, limitPerGroup),
    decisions: takeNewest(groups.decisions, limitPerGroup),
    nextSteps: takeNewest(groups.nextSteps, limitPerGroup),
    blockers: takeNewest(groups.blockers, limitPerGroup),
  };
}
