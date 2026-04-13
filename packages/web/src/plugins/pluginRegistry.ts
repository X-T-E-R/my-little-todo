import { getSetting, putSetting } from '../storage/settingsApi';
import {
  DEFAULT_REGISTRY_URL,
  type PluginRegistryFile,
  REGISTRY_CACHE_PREFIX,
  REGISTRY_SOURCES_KEY,
  type RegistryPluginEntry,
} from './types';

function parseSources(raw: string | null): string[] {
  if (!raw) return [DEFAULT_REGISTRY_URL];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr) && arr.every((u) => typeof u === 'string')) {
      return arr.length > 0 ? arr : [DEFAULT_REGISTRY_URL];
    }
  } catch {
    /* fallthrough */
  }
  return [DEFAULT_REGISTRY_URL];
}

export async function getRegistrySources(): Promise<string[]> {
  return parseSources(await getSetting(REGISTRY_SOURCES_KEY));
}

export async function setRegistrySources(urls: string[]): Promise<void> {
  await putSetting(REGISTRY_SOURCES_KEY, JSON.stringify(urls));
}

function cacheKey(url: string): string {
  return `${REGISTRY_CACHE_PREFIX}${encodeURIComponent(url)}`;
}

export async function fetchRegistryIndex(url: string): Promise<PluginRegistryFile> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
  const data = (await res.json()) as PluginRegistryFile;
  if (typeof data.schemaVersion !== 'number' || !Array.isArray(data.plugins)) {
    throw new Error('Invalid registry.json shape');
  }
  await putSetting(cacheKey(url), JSON.stringify(data));
  return data;
}

export async function getCachedRegistry(url: string): Promise<PluginRegistryFile | null> {
  const raw = await getSetting(cacheKey(url));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PluginRegistryFile;
  } catch {
    return null;
  }
}

export async function mergeAllRegistryPlugins(): Promise<RegistryPluginEntry[]> {
  const sources = await getRegistrySources();
  const merged = new Map<string, RegistryPluginEntry>();
  for (const src of sources) {
    try {
      const file = await fetchRegistryIndex(src);
      for (const p of file.plugins) {
        merged.set(p.id, p);
      }
    } catch {
      const cached = await getCachedRegistry(src);
      if (cached) {
        for (const p of cached.plugins) {
          merged.set(p.id, p);
        }
      }
    }
  }
  return [...merged.values()];
}
