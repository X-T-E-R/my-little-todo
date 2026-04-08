import { create } from 'zustand';
import { getSetting, putSetting } from '../storage/settingsApi';
import { BUILT_IN_MODULES } from './registry';

const settingKey = (id: string) => `module:${id}:enabled`;

const defaultEnabled = (): Record<string, boolean> =>
  Object.fromEntries(BUILT_IN_MODULES.map((m) => [m.id, m.defaultEnabled]));

export const useModuleStore = create<{
  hydrated: boolean;
  enabled: Record<string, boolean>;
  hydrate: () => Promise<void>;
  setModuleEnabled: (id: string, enabled: boolean) => Promise<void>;
  isEnabled: (id: string) => boolean;
}>((set, get) => ({
  hydrated: false,
  enabled: defaultEnabled(),
  hydrate: async () => {
    const next = { ...get().enabled };
    for (const m of BUILT_IN_MODULES) {
      const v = await getSetting(settingKey(m.id));
      if (v === 'true') next[m.id] = true;
      else if (v === 'false') next[m.id] = false;
    }
    set({ enabled: next, hydrated: true });
  },
  setModuleEnabled: async (id, en) => {
    await putSetting(settingKey(id), en ? 'true' : 'false');
    set((s) => ({ enabled: { ...s.enabled, [id]: en } }));
  },
  isEnabled: (id) => get().enabled[id] ?? true,
}));
