import { create } from 'zustand';
import { getSetting, putSetting } from '../storage/settingsApi';

export type EnergyLevel = 'low' | 'normal' | 'high';

const SETTINGS_KEY = 'exec-coach-settings';

export interface ExecCoachSettings {
  energyLevel: EnergyLevel;
  /** Max tasks considered "in progress" before soft WIP prompts. */
  wipLimit: number;
  /** Days since last open — used for welcome messaging (retention). */
  lastAppOpenAt?: string;
  /** Total completed tasks ever (approximate, from local counter bumps). */
  totalCompletedCelebrations?: number;
}

const defaultSettings: ExecCoachSettings = {
  energyLevel: 'normal',
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
      const next = {
        energyLevel,
        wipLimit: state.wipLimit,
        lastAppOpenAt: state.lastAppOpenAt,
        totalCompletedCelebrations: state.totalCompletedCelebrations,
      };
      persist(next);
      return { energyLevel };
    });
  },

  setWipLimit: (wipLimit) => {
    const n = Math.max(1, Math.min(20, Math.floor(wipLimit)));
    set((state) => {
      persist({
        energyLevel: state.energyLevel,
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
        wipLimit: state.wipLimit,
        lastAppOpenAt,
        totalCompletedCelebrations: state.totalCompletedCelebrations,
      });
      return { lastAppOpenAt };
    });
  },
}));
