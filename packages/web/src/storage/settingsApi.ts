import { getDataStore } from './dataStore';

const SETTINGS_CHANGE_EVENT = 'mlt-setting-change';

type SettingsChangeDetail = {
  key: string;
  value: string | null;
};

/**
 * @deprecated Base URL is now managed by the DataStore implementation.
 */
let _apiBase = '';

export function setSettingsApiBase(url: string) {
  _apiBase = url;
}

export function getSettingsApiBase(): string {
  return _apiBase;
}

export async function getSetting(key: string): Promise<string | null> {
  return getDataStore().getSetting(key);
}

export async function putSetting(key: string, value: string): Promise<void> {
  await getDataStore().putSetting(key, value);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<SettingsChangeDetail>(SETTINGS_CHANGE_EVENT, {
        detail: { key, value },
      }),
    );
  }
}

export async function deleteSetting(key: string): Promise<void> {
  await getDataStore().deleteSetting(key);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<SettingsChangeDetail>(SETTINGS_CHANGE_EVENT, {
        detail: { key, value: null },
      }),
    );
  }
}

export async function getAllSettings(): Promise<Record<string, string>> {
  return getDataStore().getAllSettings();
}

export function subscribeSetting(
  key: string,
  listener: (value: string | null) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<SettingsChangeDetail>).detail;
    if (!detail || detail.key !== key) return;
    listener(detail.value);
  };
  window.addEventListener(SETTINGS_CHANGE_EVENT, handler);
  return () => window.removeEventListener(SETTINGS_CHANGE_EVENT, handler);
}
