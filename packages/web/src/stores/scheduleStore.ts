import { create } from 'zustand';
import { getSetting, putSetting } from '../storage/settingsApi';

export interface ScheduleBlock {
  id: string;
  name: string;
  color: string;
  startTime: string;
  endTime: string;
  recurrence: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  daysOfWeek: number[];
  validFrom?: Date;
  validUntil?: Date;
  exceptions: string[];
  location?: string;
  roleId?: string;
}

interface ScheduleState {
  blocks: ScheduleBlock[];
  loading: boolean;
  load: () => Promise<void>;
  addBlock: (block: ScheduleBlock) => void;
  updateBlock: (block: ScheduleBlock) => void;
  removeBlock: (id: string) => void;
}

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

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  blocks: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const raw = await getSetting(SETTING_KEY);
      const blocks = raw ? deserializeBlocks(raw) : [];
      set({ blocks, loading: false });
    } catch {
      set({ loading: false });
    }
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

export function isInScheduleBlock(blocks: ScheduleBlock[], now: Date = new Date()): ScheduleBlock | null {
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
