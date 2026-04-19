import { create } from 'zustand';
import { getSetting, putSetting } from '../storage/settingsApi';

export type EnergyLevel = 'low' | 'normal' | 'high';
export type WorkMode = 'neutral' | 'exploring' | 'executing' | 'blocked';

export interface WorkStateHistoryEntry {
  id: string;
  energyLevel: EnergyLevel;
  workMode: WorkMode;
  note?: string;
  createdAt: string;
}

const SETTINGS_KEY = 'exec-coach-settings';

export interface ExecCoachSettings {
  energyLevel: EnergyLevel;
  workMode: WorkMode;
  workStateNote?: string;
  workStateHistory: WorkStateHistoryEntry[];
  /** Max tasks considered "in progress" before soft WIP prompts. */
  wipLimit: number;
  /** Days since last open — used for welcome messaging (retention). */
  lastAppOpenAt?: string;
  /** Total completed tasks ever (approximate, from local counter bumps). */
  totalCompletedCelebrations?: number;
}

const defaultSettings: ExecCoachSettings = {
  energyLevel: 'normal',
  workMode: 'neutral',
  workStateHistory: [],
  wipLimit: 3,
};

function parseSettings(raw: string | null): ExecCoachSettings {
  if (!raw) return { ...defaultSettings };
  try {
    const p = JSON.parse(raw) as Partial<ExecCoachSettings>;
    return {
      energyLevel:
        p.energyLevel === 'low' || p.energyLevel === 'high' || p.energyLevel === 'normal'
          ? p.energyLevel
          : 'normal',
      workMode:
        p.workMode === 'exploring' ||
        p.workMode === 'executing' ||
        p.workMode === 'blocked' ||
        p.workMode === 'neutral'
          ? p.workMode
          : 'neutral',
      workStateNote: typeof p.workStateNote === 'string' ? p.workStateNote : undefined,
      workStateHistory: Array.isArray(p.workStateHistory)
        ? p.workStateHistory
            .filter(
              (item): item is WorkStateHistoryEntry =>
                !!item &&
                typeof item === 'object' &&
                typeof (item as WorkStateHistoryEntry).id === 'string' &&
                typeof (item as WorkStateHistoryEntry).createdAt === 'string',
            )
            .slice(0, 24)
        : [],
      wipLimit: typeof p.wipLimit === 'number' && p.wipLimit > 0 ? p.wipLimit : 3,
      lastAppOpenAt: p.lastAppOpenAt,
      totalCompletedCelebrations: p.totalCompletedCelebrations,
    };
  } catch {
    return { ...defaultSettings };
  }
}

interface ExecCoachState extends ExecCoachSettings {
  loaded: boolean;
  load: () => Promise<void>;
  setEnergyLevel: (level: EnergyLevel) => void;
  setWorkMode: (mode: WorkMode, note?: string) => void;
  saveWorkStateNote: (note: string) => void;
  setWipLimit: (n: number) => void;
  bumpCompletionCount: () => void;
  touchAppOpen: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist(state: ExecCoachSettings) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    putSetting(SETTINGS_KEY, JSON.stringify(state)).catch(() => {});
  }, 400);
}

function buildWorkStateHistoryEntry(
  energyLevel: EnergyLevel,
  workMode: WorkMode,
  note?: string,
): WorkStateHistoryEntry {
  return {
    id: crypto.randomUUID(),
    energyLevel,
    workMode,
    note: note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
}

export const useExecCoachStore = create<ExecCoachState>((set) => ({
  ...defaultSettings,
  loaded: false,

  load: async () => {
    try {
      const raw = await getSetting(SETTINGS_KEY);
      const s = parseSettings(raw);
      set({ ...s, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  setEnergyLevel: (energyLevel) => {
    set((state) => {
      if (state.energyLevel === energyLevel) {
        return { energyLevel };
      }
      const nextEntry = buildWorkStateHistoryEntry(
        energyLevel,
        state.workMode,
        state.workStateNote,
      );
      const workStateHistory = [nextEntry, ...state.workStateHistory].slice(0, 24);
      const next = {
        energyLevel,
        workMode: state.workMode,
        workStateNote: state.workStateNote,
        workStateHistory,
        wipLimit: state.wipLimit,
        lastAppOpenAt: state.lastAppOpenAt,
        totalCompletedCelebrations: state.totalCompletedCelebrations,
      };
      persist(next);
      return { energyLevel, workStateHistory };
    });
  },

  setWorkMode: (workMode, note) => {
    set((state) => {
      const trimmedNote = note?.trim() || state.workStateNote;
      if (state.workMode === workMode && trimmedNote === state.workStateNote) {
        return {
          workMode,
          workStateNote: trimmedNote?.trim() || undefined,
        };
      }
      const nextEntry = buildWorkStateHistoryEntry(state.energyLevel, workMode, trimmedNote);
      const workStateHistory = [nextEntry, ...state.workStateHistory].slice(0, 24);
      persist({
        energyLevel: state.energyLevel,
        workMode,
        workStateNote: trimmedNote?.trim() || undefined,
        workStateHistory,
        wipLimit: state.wipLimit,
        lastAppOpenAt: state.lastAppOpenAt,
        totalCompletedCelebrations: state.totalCompletedCelebrations,
      });
      return {
        workMode,
        workStateNote: trimmedNote?.trim() || undefined,
        workStateHistory,
      };
    });
  },

  saveWorkStateNote: (workStateNote) => {
    set((state) => {
      const nextNote = workStateNote.trim() || undefined;
      persist({
        energyLevel: state.energyLevel,
        workMode: state.workMode,
        workStateNote: nextNote,
        workStateHistory: state.workStateHistory,
        wipLimit: state.wipLimit,
        lastAppOpenAt: state.lastAppOpenAt,
        totalCompletedCelebrations: state.totalCompletedCelebrations,
      });
      return { workStateNote: nextNote };
    });
  },

  setWipLimit: (wipLimit) => {
    const n = Math.max(1, Math.min(20, Math.floor(wipLimit)));
    set((state) => {
      persist({
        energyLevel: state.energyLevel,
        workMode: state.workMode,
        workStateNote: state.workStateNote,
        workStateHistory: state.workStateHistory,
        wipLimit: n,
        lastAppOpenAt: state.lastAppOpenAt,
        totalCompletedCelebrations: state.totalCompletedCelebrations,
      });
      return { wipLimit: n };
    });
  },

  bumpCompletionCount: () => {
    set((state) => {
      const totalCompletedCelebrations = (state.totalCompletedCelebrations ?? 0) + 1;
      persist({
        energyLevel: state.energyLevel,
        workMode: state.workMode,
        workStateNote: state.workStateNote,
        workStateHistory: state.workStateHistory,
        wipLimit: state.wipLimit,
        lastAppOpenAt: state.lastAppOpenAt,
        totalCompletedCelebrations,
      });
      return { totalCompletedCelebrations };
    });
  },

  touchAppOpen: () => {
    set((state) => {
      const lastAppOpenAt = new Date().toISOString();
      persist({
        energyLevel: state.energyLevel,
        workMode: state.workMode,
        workStateNote: state.workStateNote,
        workStateHistory: state.workStateHistory,
        wipLimit: state.wipLimit,
        lastAppOpenAt,
        totalCompletedCelebrations: state.totalCompletedCelebrations,
      });
      return { lastAppOpenAt };
    });
  },
}));
