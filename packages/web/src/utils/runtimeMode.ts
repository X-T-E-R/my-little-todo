import type { Platform } from './platform';

export type RuntimeStoreKind = 'api' | 'tauri-sqlite' | 'capacitor-sqlite';
export type AuthRuntime = 'server' | 'local-native';

export interface RuntimeMode {
  storeKind: RuntimeStoreKind;
  apiBase: string;
  authRuntime: AuthRuntime;
}

function normalizeApiBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function resolveRuntimeMode(platform: Platform, cloudUrl: string): RuntimeMode {
  if (platform === 'tauri') {
    return {
      storeKind: 'tauri-sqlite',
      apiBase: '',
      authRuntime: 'local-native',
    };
  }

  if (platform === 'capacitor') {
    return {
      storeKind: 'capacitor-sqlite',
      apiBase: '',
      authRuntime: 'local-native',
    };
  }

  const apiBase = normalizeApiBase(cloudUrl);
  return {
    storeKind: 'api',
    apiBase: platform === 'web-hosted' ? '' : apiBase,
    authRuntime: 'server',
  };
}
