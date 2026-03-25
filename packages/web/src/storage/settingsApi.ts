import { getDataStore } from './dataStore';

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
  return getDataStore().putSetting(key, value);
}

export async function deleteSetting(key: string): Promise<void> {
  return getDataStore().deleteSetting(key);
}

export async function getAllSettings(): Promise<Record<string, string>> {
  return getDataStore().getAllSettings();
}
