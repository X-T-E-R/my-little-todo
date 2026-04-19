import { create } from 'zustand';
import { useModuleStore } from '../../modules/moduleStore';
import { getSetting, putSetting } from '../../storage/settingsApi';
import { isTauriEnv } from '../../utils/platform';
import {
  DEFAULT_EMBEDDED_HOST_CONFIG,
  EMBEDDED_HOST_CONFIG_KEYS,
  embeddedHostBaseUrl,
  normalizeEmbeddedHostConfig,
  validateEmbeddedHostConfig,
  type EmbeddedHostConfig,
  type EmbeddedHostRuntimeState,
  type EmbeddedHostStatus,
} from './embeddedHostContract';
import {
  getEmbeddedHostRuntimeState,
  restartEmbeddedHost,
  startEmbeddedHost,
  stopEmbeddedHost,
} from './embeddedHostBridge';

interface EmbeddedHostStoreState extends EmbeddedHostRuntimeState {
  hydrated: boolean;
  config: EmbeddedHostConfig;
  hydrate: () => Promise<void>;
  saveConfig: (patch: Partial<EmbeddedHostConfig>) => Promise<void>;
  syncRuntimeState: () => Promise<void>;
  startRuntime: () => Promise<void>;
  stopRuntime: () => Promise<void>;
  restartRuntime: () => Promise<void>;
  setRuntimeState: (patch: Partial<EmbeddedHostRuntimeState>) => void;
}

function parsePort(value: string | null): number | undefined {
  if (!value) return undefined;
  const next = Number(value);
  return Number.isInteger(next) && next > 0 ? next : undefined;
}

export function resolveDesktopHostBaseUrl(state: {
  moduleEnabled: boolean;
  status: EmbeddedHostStatus;
  baseUrl?: string | null;
  config: EmbeddedHostConfig;
}): string | null {
  if (!state.moduleEnabled) return null;
  if (state.status !== 'running') return null;
  return state.baseUrl ?? embeddedHostBaseUrl(state.config);
}

export function getDesktopEmbeddedHostBaseUrl(): string | null {
  const state = useEmbeddedHostStore.getState();
  return resolveDesktopHostBaseUrl({
    moduleEnabled: useModuleStore.getState().isEnabled('embedded-host'),
    status: state.status,
    baseUrl: state.baseUrl,
    config: state.config,
  });
}

export const useEmbeddedHostStore = create<EmbeddedHostStoreState>((set, get) => ({
  hydrated: false,
  config: DEFAULT_EMBEDDED_HOST_CONFIG,
  status: 'inactive',
  baseUrl: null,
  lastError: undefined,
  hydrate: async () => {
    const [host, port, authProvider, signupPolicy] = await Promise.all([
      getSetting(EMBEDDED_HOST_CONFIG_KEYS.host),
      getSetting(EMBEDDED_HOST_CONFIG_KEYS.port),
      getSetting(EMBEDDED_HOST_CONFIG_KEYS.authProvider),
      getSetting(EMBEDDED_HOST_CONFIG_KEYS.signupPolicy),
    ]);

    const config = normalizeEmbeddedHostConfig({
      enabled: useModuleStore.getState().isEnabled('embedded-host'),
      host: host ?? undefined,
      port: parsePort(port),
      authProvider: authProvider === 'embedded' ? 'embedded' : undefined,
      signupPolicy:
        signupPolicy === 'admin_only' || signupPolicy === 'open' || signupPolicy === 'invite_only'
          ? signupPolicy
          : undefined,
    });

    set({
      hydrated: true,
      config,
    });

    if (isTauriEnv()) {
      await get().syncRuntimeState();
    }
  },
  saveConfig: async (patch) => {
    try {
      const config = normalizeEmbeddedHostConfig({
        ...get().config,
        ...patch,
        enabled: useModuleStore.getState().isEnabled('embedded-host'),
      });
      validateEmbeddedHostConfig(config);

      await Promise.all([
        putSetting(EMBEDDED_HOST_CONFIG_KEYS.host, config.host),
        putSetting(EMBEDDED_HOST_CONFIG_KEYS.port, String(config.port)),
        putSetting(EMBEDDED_HOST_CONFIG_KEYS.authProvider, config.authProvider),
        putSetting(EMBEDDED_HOST_CONFIG_KEYS.signupPolicy, config.signupPolicy),
      ]);

      set({
        config,
        lastError: undefined,
        baseUrl: get().baseUrl,
      });
    } catch (error) {
      set({
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  },
  syncRuntimeState: async () => {
    if (!isTauriEnv()) return;
    try {
      const runtime = await getEmbeddedHostRuntimeState();
      set({
        status: runtime.status,
        baseUrl: runtime.baseUrl,
        lastError: runtime.lastError,
      });
    } catch (error) {
      set({
        status: 'failed',
        baseUrl: null,
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  },
  startRuntime: async () => {
    if (!isTauriEnv()) return;
    const config = normalizeEmbeddedHostConfig({
      ...get().config,
      enabled: useModuleStore.getState().isEnabled('embedded-host'),
    });
    try {
      validateEmbeddedHostConfig(config);
      set({ status: 'starting', lastError: undefined, baseUrl: null });
      const runtime = await startEmbeddedHost(config);
      set({
        status: runtime.status,
        baseUrl: runtime.baseUrl,
        lastError: runtime.lastError,
      });
    } catch (error) {
      set({
        status: 'failed',
        baseUrl: null,
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  },
  stopRuntime: async () => {
    if (!isTauriEnv()) return;
    try {
      set({ status: 'stopping', lastError: undefined });
      const runtime = await stopEmbeddedHost();
      set({
        status: runtime.status,
        baseUrl: runtime.baseUrl,
        lastError: runtime.lastError,
      });
    } catch (error) {
      set({
        status: 'failed',
        baseUrl: null,
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  },
  restartRuntime: async () => {
    if (!isTauriEnv()) return;
    const config = normalizeEmbeddedHostConfig({
      ...get().config,
      enabled: useModuleStore.getState().isEnabled('embedded-host'),
    });
    try {
      validateEmbeddedHostConfig(config);
      set({ status: 'starting', lastError: undefined, baseUrl: null });
      const runtime = await restartEmbeddedHost(config);
      set({
        status: runtime.status,
        baseUrl: runtime.baseUrl,
        lastError: runtime.lastError,
      });
    } catch (error) {
      set({
        status: 'failed',
        baseUrl: null,
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  },
  setRuntimeState: (patch) => {
    const nextStatus = patch.status ?? get().status;
    set({
      status: nextStatus,
      lastError: patch.lastError ?? get().lastError,
      baseUrl:
        nextStatus === 'running' && useModuleStore.getState().isEnabled('embedded-host')
          ? patch.baseUrl ?? get().baseUrl
          : null,
    });
  },
}));
