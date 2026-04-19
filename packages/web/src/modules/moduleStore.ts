import { create } from 'zustand';
import { INSTALLED_REGISTRY_KEY } from '../plugins/types';
import { getSetting, putSetting } from '../storage/settingsApi';
import { BUILT_IN_MODULES } from './registry';

const settingKey = (id: string) => `module:${id}:enabled`;

const defaultEnabled = (): Record<string, boolean> =>
  Object.fromEntries(BUILT_IN_MODULES.map((m) => [m.id, m.defaultEnabled]));

async function loadInstalledPluginIds(): Promise<string[]> {
  const raw = await getSetting(INSTALLED_REGISTRY_KEY);
  if (!raw) return [];
  try {
    const reg = JSON.parse(raw) as Record<string, unknown>;
    return Object.keys(reg);
  } catch {
    return [];
  }
}

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
    const next = { ...defaultEnabled() };
    for (const m of BUILT_IN_MODULES) {
      const v = await getSetting(settingKey(m.id));
      if (v === 'true') next[m.id] = true;
      else if (v === 'false') next[m.id] = false;
    }
    const pluginIds = await loadInstalledPluginIds();
    for (const pid of pluginIds) {
      const v = await getSetting(settingKey(pid));
      if (v === 'true') next[pid] = true;
      else if (v === 'false') next[pid] = false;
      else next[pid] = true;
    }
    set({ enabled: next, hydrated: true });
  },
  setModuleEnabled: async (id, en) => {
    await putSetting(settingKey(id), en ? 'true' : 'false');
    set((s) => ({ enabled: { ...s.enabled, [id]: en } }));
    if (id === 'embedded-host') {
      const [{ isTauriEnv }, { useEmbeddedHostStore }] = await Promise.all([
        import('../utils/platform'),
        import('../features/embedded-host/embeddedHostStore'),
      ]);
      if (!isTauriEnv()) return;
      if (en) {
        await useEmbeddedHostStore.getState().hydrate();
        await useEmbeddedHostStore.getState().startRuntime();
        return;
      }
      await useEmbeddedHostStore.getState().stopRuntime();
      useEmbeddedHostStore.getState().setRuntimeState({
        status: 'inactive',
        baseUrl: null,
        lastError: undefined,
      });
    }
  },
  isEnabled: (id) => get().enabled[id] ?? true,
}));
