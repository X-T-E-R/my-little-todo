import { create } from 'zustand';
import { getSetting, putSetting } from '../storage/settingsApi';

export type RecommendationAction = 'accepted' | 'rejected' | 'swapped';

export interface RecommendationEvent {
  id: string;
  timestamp: Date;
  taskId: string;
  taskTitle: string;
  action: RecommendationAction;
  rejectionReason?: string;
}

interface BehaviorState {
  events: RecommendationEvent[];
  load: () => Promise<void>;
  recordEvent: (event: Omit<RecommendationEvent, 'id' | 'timestamp'>) => void;
}

const SETTING_KEY = 'behavior-events';
const MAX_EVENTS = 500;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debounceSave(events: RecommendationEvent[]) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const trimmed = events.slice(-MAX_EVENTS);
    putSetting(SETTING_KEY, JSON.stringify(trimmed)).catch(() => {});
  }, 500);
}

function deserializeEvents(raw: string): RecommendationEvent[] {
  try {
    const parsed = JSON.parse(raw) as Array<RecommendationEvent & { timestamp: string }>;
    return parsed.map((e) => ({ ...e, timestamp: new Date(e.timestamp) }));
  } catch {
    return [];
  }
}

export const useBehaviorStore = create<BehaviorState>((set, get) => ({
  events: [],

  load: async () => {
    try {
      const raw = await getSetting(SETTING_KEY);
      const events = raw ? deserializeEvents(raw) : [];
      set({ events });
    } catch {
      // keep empty
    }
  },

  recordEvent: (partial) => {
    const event: RecommendationEvent = {
      ...partial,
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date(),
    };
    const updated = [...get().events, event];
    set({ events: updated });
    debounceSave(updated);
  },
}));

export function getTodayStats(events: RecommendationEvent[]) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = events.filter((e) => e.timestamp >= todayStart);
  return {
    total: today.length,
    accepted: today.filter((e) => e.action === 'accepted').length,
    rejected: today.filter((e) => e.action === 'rejected').length,
    swapped: today.filter((e) => e.action === 'swapped').length,
  };
}

export function getWeekStats(events: RecommendationEvent[]) {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const week = events.filter((e) => e.timestamp >= weekStart);
  return {
    total: week.length,
    accepted: week.filter((e) => e.action === 'accepted').length,
    rejected: week.filter((e) => e.action === 'rejected').length,
    swapped: week.filter((e) => e.action === 'swapped').length,
  };
}
