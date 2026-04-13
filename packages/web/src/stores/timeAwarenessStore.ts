import type {
  ScheduleBlock,
  TimeContext,
  TimeOfDayPeriod,
  TimeSlotSuggestion,
} from '@my-little-todo/core';
import { create } from 'zustand';
import { getSetting, putSetting } from '../storage/settingsApi';
import {
  computeHourlyAcceptancePatterns,
  findLowEnergyHour,
  findPeakProductivityHour,
  getHourPreferenceBoost,
} from '../utils/timeAwarenessPatterns';
import type { RecommendationEvent } from './behaviorStore';

export type { ScheduleBlock } from '@my-little-todo/core';

const SETTING_KEY = 'schedule-blocks';

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debounceSave(blocks: ScheduleBlock[]) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    putSetting(SETTING_KEY, JSON.stringify(blocks)).catch(() => {});
  }, 300);
}

function deserializeBlocks(raw: string): ScheduleBlock[] {
  try {
    const parsed = JSON.parse(raw) as ScheduleBlock[];
    return parsed.map((b) => ({
      ...b,
      validFrom: b.validFrom ? new Date(b.validFrom) : undefined,
      validUntil: b.validUntil ? new Date(b.validUntil) : undefined,
    }));
  } catch {
    return [];
  }
}

let _loadPromise: Promise<void> | null = null;

interface TimeAwarenessState {
  blocks: ScheduleBlock[];
  loading: boolean;
  load: () => Promise<void>;
  addBlock: (block: ScheduleBlock) => void;
  updateBlock: (block: ScheduleBlock) => void;
  removeBlock: (id: string) => void;
}

export const useTimeAwarenessStore = create<TimeAwarenessState>((set, get) => ({
  blocks: [],
  loading: false,

  load: async () => {
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
      set({ loading: true });
      try {
        const raw = await getSetting(SETTING_KEY);
        const blocks = raw ? deserializeBlocks(raw) : [];
        set({ blocks, loading: false });
      } catch {
        set({ loading: false });
      } finally {
        _loadPromise = null;
      }
    })();
    return _loadPromise;
  },

  addBlock: (block) => {
    const updated = [...get().blocks, block];
    set({ blocks: updated });
    debounceSave(updated);
  },

  updateBlock: (block) => {
    const updated = get().blocks.map((b) => (b.id === block.id ? block : b));
    set({ blocks: updated });
    debounceSave(updated);
  },

  removeBlock: (id) => {
    const updated = get().blocks.filter((b) => b.id !== id);
    set({ blocks: updated });
    debounceSave(updated);
  },
}));

export function isInScheduleBlock(
  blocks: ScheduleBlock[],
  now: Date = new Date(),
): ScheduleBlock | null {
  const dayOfWeek = now.getDay();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  for (const block of blocks) {
    if (!block.daysOfWeek.includes(dayOfWeek)) continue;
    if (block.exceptions.includes(dateStr)) continue;
    if (block.validFrom && now < block.validFrom) continue;
    if (block.validUntil && now > block.validUntil) continue;
    if (timeStr >= block.startTime && timeStr <= block.endTime) return block;
  }
  return null;
}

function parseTimeToToday(now: Date, time: string): Date {
  const [h, m] = time.split(':').map((x) => Number.parseInt(x, 10));
  const d = new Date(now);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

/**
 * Minutes until the next applicable block starts, if within `withinMinutes` from now.
 */
export function minutesUntilNextBlockStart(
  blocks: ScheduleBlock[],
  now: Date = new Date(),
  withinMinutes = 15,
): number | null {
  const dayOfWeek = now.getDay();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const limitMs = withinMinutes * 60 * 1000;
  let best: number | null = null;

  for (const block of blocks) {
    if (!block.daysOfWeek.includes(dayOfWeek)) continue;
    if (block.exceptions.includes(dateStr)) continue;
    if (block.validFrom && now < block.validFrom) continue;
    if (block.validUntil && now > block.validUntil) continue;

    const startAt = parseTimeToToday(now, block.startTime);
    const diff = startAt.getTime() - now.getTime();
    if (diff <= 0 || diff > limitMs) continue;
    const mins = Math.ceil(diff / 60000);
    if (best === null || mins < best) best = mins;
  }
  return best;
}

export function isApproachingBlock(
  blocks: ScheduleBlock[],
  withinMinutes = 15,
  now: Date = new Date(),
): boolean {
  return minutesUntilNextBlockStart(blocks, now, withinMinutes) !== null;
}

function periodFromHour(hour: number): TimeOfDayPeriod {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

export function getCurrentTimeContext(
  blocks: ScheduleBlock[],
  now: Date = new Date(),
  lookaheadMinutes = 15,
): TimeContext {
  const hour = now.getHours();
  const active = isInScheduleBlock(blocks, now);
  const approaching = minutesUntilNextBlockStart(blocks, now, lookaheadMinutes);
  return {
    period: periodFromHour(hour),
    hour,
    inFixedBlock: active !== null,
    fixedBlockName: active?.name,
    fixedBlockId: active?.id,
    approachingBlockMinutes: approaching,
  };
}

export function getTimeSlotSuggestion(
  blocks: ScheduleBlock[],
  behaviorEvents: RecommendationEvent[],
  now: Date = new Date(),
): TimeSlotSuggestion {
  const active = isInScheduleBlock(blocks, now);
  if (active) {
    return { kind: 'in_fixed_block', messageKey: 'time_suggestion_in_block' };
  }
  if (isApproachingBlock(blocks, 15, now)) {
    return { kind: 'prefer_short', messageKey: 'time_suggestion_approaching' };
  }
  const patterns = computeHourlyAcceptancePatterns(behaviorEvents);
  const peak = findPeakProductivityHour(patterns);
  const low = findLowEnergyHour(patterns);
  const h = now.getHours();
  if (peak !== null && h === peak) {
    return { kind: 'prefer_heavy', messageKey: 'time_suggestion_peak_hour' };
  }
  if (low !== null && h === low) {
    return { kind: 'prefer_light', messageKey: 'time_suggestion_low_hour' };
  }
  return { kind: 'neutral', messageKey: 'time_suggestion_neutral' };
}

/** For settings UI: human-readable summary lines (caller supplies i18n). */
export function getLearnedTimeSummary(
  patterns: ReturnType<typeof computeHourlyAcceptancePatterns>,
): {
  peakHour: number | null;
  lowHour: number | null;
} {
  return {
    peakHour: findPeakProductivityHour(patterns),
    lowHour: findLowEnergyHour(patterns),
  };
}

export { getHourPreferenceBoost, computeHourlyAcceptancePatterns };
