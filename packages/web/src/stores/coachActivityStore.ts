import { create } from 'zustand';
import { getSetting, putSetting } from '../storage/settingsApi';

const KEY = 'coach-activity-events';
const MAX = 200;

export type CoachActivityType = 'view_switch' | 'task_focus_start' | 'task_create';

export interface CoachActivityEvent {
  id: string;
  timestamp: Date;
  type: CoachActivityType;
  payload: Record<string, unknown>;
}

interface State {
  events: CoachActivityEvent[];
  load: () => Promise<void>;
  record: (partial: Omit<CoachActivityEvent, 'id' | 'timestamp'>) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debounceSave(events: CoachActivityEvent[]) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const trimmed = events.slice(-MAX);
    putSetting(KEY, JSON.stringify(trimmed)).catch(() => {});
  }, 400);
}

function deserialize(raw: string): CoachActivityEvent[] {
  try {
    const parsed = JSON.parse(raw) as Array<CoachActivityEvent & { timestamp: string }>;
    return parsed.map((e) => ({ ...e, timestamp: new Date(e.timestamp) }));
  } catch {
    return [];
  }
}

/** Recent distinct task ids "touched" for focus / start heuristics. */
export function countTaskSwitchesInWindow(events: CoachActivityEvent[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  const recent = events.filter((e) => e.timestamp.getTime() >= cutoff);
  const taskIds = new Set<string>();
  for (const e of recent) {
    if (e.type === 'task_focus_start' && typeof e.payload.taskId === 'string') {
      taskIds.add(e.payload.taskId);
    }
  }
  return taskIds.size;
}

/** View tab switches in window (rhythm mirror). */
export function countViewSwitchesInWindow(events: CoachActivityEvent[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return events.filter((e) => e.type === 'view_switch' && e.timestamp.getTime() >= cutoff).length;
}

let _coachActivityLoadPromise: Promise<void> | null = null;

export const useCoachActivityStore = create<State>((set, get) => ({
  events: [],

  load: async () => {
    if (_coachActivityLoadPromise) return _coachActivityLoadPromise;
    _coachActivityLoadPromise = (async () => {
      try {
        const raw = await getSetting(KEY);
        set({ events: raw ? deserialize(raw) : [] });
      } catch {
        set({ events: [] });
      } finally {
        _coachActivityLoadPromise = null;
      }
    })();
    return _coachActivityLoadPromise;
  },

  record: (partial) => {
    const event: CoachActivityEvent = {
      ...partial,
      id: `ca-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date(),
    };
    const updated = [...get().events, event];
    set({ events: updated });
    debounceSave(updated);
  },
}));
