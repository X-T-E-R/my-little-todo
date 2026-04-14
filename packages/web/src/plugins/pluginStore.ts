import { create } from 'zustand';
import { deleteSetting, getSetting, putSetting } from '../storage/settingsApi';
import { removePluginDirectory } from './pluginFs';
import { installMltpPackage } from './pluginLoader';
import { activatePlugin, deactivatePlugin } from './pluginRuntime';
import {
  reconcilePluginServerRuntime,
  reconcilePluginServerRuntimes,
  stopPluginServerRuntime,
} from './pluginServerRuntime';
import {
  INSTALLED_REGISTRY_KEY,
  type InstalledPluginRecord,
  PLUGIN_DEV_MANIFEST_KEY,
  PLUGIN_DEV_MODE_KEY,
} from './types';

const moduleSettingKey = (id: string) => `module:${id}:enabled`;

function loadRegistry(raw: string | null): Record<string, InstalledPluginRecord> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, InstalledPluginRecord>;
    return Object.fromEntries(
      Object.entries(parsed).map(([id, record]) => [
        id,
        {
          ...record,
          stability: record.stability ?? record.manifest.stability ?? 'beta',
          serverApproved: record.serverApproved ?? !record.manifest.server,
          serverStatus:
            record.serverStatus ??
            (record.manifest.server
              ? record.serverApproved
                ? 'unavailable'
                : 'inactive'
              : undefined),
          serverLastError: record.serverLastError,
        },
      ]),
    );
  } catch {
    return {};
  }
}

async function saveRegistry(reg: Record<string, InstalledPluginRecord>): Promise<void> {
  await putSetting(INSTALLED_REGISTRY_KEY, JSON.stringify(reg));
}

async function hydrateModulesStore(): Promise<void> {
  const { useModuleStore } = await import('../modules/moduleStore');
  await useModuleStore.getState().hydrate();
}

async function deletePluginDataKeys(pluginId: string): Promise<void> {
  const { getDataStore } = await import('../storage/dataStore');
  const store = getDataStore();
  const all = await store.getAllSettings();
  const prefix = `plugin:${pluginId}:`;
  for (const k of Object.keys(all)) {
    if (k.startsWith(prefix)) {
      await store.deleteSetting(k);
    }
  }
}

export const usePluginStore = create<{
  hydrated: boolean;
  plugins: Record<string, InstalledPluginRecord>;
  devMode: boolean;
  devManifestJson: string | null;
  hydrate: () => Promise<void>;
  installFromArrayBuffer: (
    buf: ArrayBuffer,
    meta?: { source?: 'file' | 'marketplace'; sourceUrl?: string; serverApproved?: boolean },
  ) => Promise<void>;
  installFromUrl: (url: string) => Promise<void>;
  enable: (id: string) => Promise<void>;
  disable: (id: string) => Promise<void>;
  uninstall: (id: string) => Promise<void>;
  setDevMode: (on: boolean) => Promise<void>;
  setDevManifestJson: (json: string | null) => Promise<void>;
  refreshFromRegistry: () => Promise<void>;
}>((set, get) => ({
  hydrated: false,
  plugins: {},
  devMode: false,
  devManifestJson: null,

  hydrate: async () => {
    const raw = await getSetting(INSTALLED_REGISTRY_KEY);
    const plugins = loadRegistry(raw);
    const devMode = (await getSetting(PLUGIN_DEV_MODE_KEY)) === 'true';
    const devManifestJson = await getSetting(PLUGIN_DEV_MANIFEST_KEY);
    set({ plugins, hydrated: true, devMode, devManifestJson });
    const updateServerState = async (
      pluginId: string,
      patch: Pick<InstalledPluginRecord, 'serverStatus' | 'serverLastError'>,
    ) => {
      const current = get().plugins[pluginId];
      if (!current) return;
      const next = {
        ...get().plugins,
        [pluginId]: {
          ...current,
          ...patch,
        },
      };
      await saveRegistry(next);
      set({ plugins: next });
    };
    await reconcilePluginServerRuntimes(Object.values(plugins), updateServerState);
  },

  refreshFromRegistry: async () => {
    const raw = await getSetting(INSTALLED_REGISTRY_KEY);
    const plugins = loadRegistry(raw);
    set({ plugins });
    const updateServerState = async (
      pluginId: string,
      patch: Pick<InstalledPluginRecord, 'serverStatus' | 'serverLastError'>,
    ) => {
      const current = get().plugins[pluginId];
      if (!current) return;
      const next = {
        ...get().plugins,
        [pluginId]: {
          ...current,
          ...patch,
        },
      };
      await saveRegistry(next);
      set({ plugins: next });
    };
    await reconcilePluginServerRuntimes(Object.values(plugins), updateServerState);
  },

    installFromArrayBuffer: async (buf, meta) => {
      const { manifest } = await installMltpPackage(buf, meta);
      if (get().plugins[manifest.id]) {
        await stopPluginServerRuntime(manifest.id);
        await deactivatePlugin(manifest.id);
        await removePluginDirectory(manifest.id);
      }
    const rec: InstalledPluginRecord = {
      id: manifest.id,
      manifest,
      installedAt: new Date().toISOString(),
      enabled: true,
      source: meta?.source ?? 'file',
      sourceUrl: meta?.sourceUrl,
      stability: manifest.stability ?? 'beta',
      serverApproved: meta?.serverApproved ?? !manifest.server,
      serverStatus: manifest.server
        ? meta?.serverApproved
          ? 'unavailable'
          : 'inactive'
        : undefined,
      };
      const next = { ...get().plugins, [manifest.id]: rec };
      await saveRegistry(next);
      set({ plugins: next });
      await putSetting(moduleSettingKey(manifest.id), 'true');
      await hydrateModulesStore();
      await activatePlugin(manifest.id, manifest);
      await reconcilePluginServerRuntime(rec, async (pluginId, patch) => {
        const current = get().plugins[pluginId];
        if (!current) return;
        const updated = {
          ...get().plugins,
          [pluginId]: {
            ...current,
            ...patch,
          },
        };
        await saveRegistry(updated);
        set({ plugins: updated });
      });
    },

  installFromUrl: async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    await get().installFromArrayBuffer(buf, { source: 'marketplace', sourceUrl: url });
  },

  enable: async (id) => {
    const p = get().plugins[id];
    if (!p) return;
    await putSetting(moduleSettingKey(id), 'true');
    const next = {
      ...get().plugins,
      [id]: {
        ...p,
        enabled: true,
        serverStatus: p.manifest.server
          ? p.serverApproved
            ? 'unavailable'
            : 'inactive'
          : p.serverStatus,
      },
    };
    await saveRegistry(next);
    set({ plugins: next });
    await hydrateModulesStore();
    await activatePlugin(id, p.manifest);
    await reconcilePluginServerRuntime(next[id], async (pluginId, patch) => {
      const current = get().plugins[pluginId];
      if (!current) return;
      const updated = {
        ...get().plugins,
        [pluginId]: {
          ...current,
          ...patch,
        },
      };
      await saveRegistry(updated);
      set({ plugins: updated });
    });
  },

  disable: async (id) => {
    const p = get().plugins[id];
    if (!p) return;
    await putSetting(moduleSettingKey(id), 'false');
    await stopPluginServerRuntime(id);
    await deactivatePlugin(id);
    const next = {
      ...get().plugins,
      [id]: {
        ...p,
        enabled: false,
        serverStatus: p.manifest.server ? 'inactive' : p.serverStatus,
        serverLastError: undefined,
      },
    };
    await saveRegistry(next);
    set({ plugins: next });
    await hydrateModulesStore();
  },

  uninstall: async (id) => {
    await stopPluginServerRuntime(id);
    await deactivatePlugin(id);
    const next = { ...get().plugins };
    delete next[id];
    await saveRegistry(next);
    set({ plugins: next });
    await removePluginDirectory(id);
    await deletePluginDataKeys(id);
    await hydrateModulesStore();
  },

  setDevMode: async (on) => {
    await putSetting(PLUGIN_DEV_MODE_KEY, on ? 'true' : 'false');
    set({ devMode: on });
  },

  setDevManifestJson: async (json) => {
    if (json) await putSetting(PLUGIN_DEV_MANIFEST_KEY, json);
    else await deleteSetting(PLUGIN_DEV_MANIFEST_KEY);
    set({ devManifestJson: json });
  },
}));
