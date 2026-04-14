import { readPluginFile, listPluginFiles } from './pluginFs';

export type PluginLocaleTree = {
  [key: string]: string | PluginLocaleTree;
};

type DiscoverPluginLocalesDeps = {
  listFiles?: (pluginId: string, relativeDir?: string) => Promise<string[]>;
  readFile?: (pluginId: string, relativePath: string) => Promise<Uint8Array | null>;
  warn?: (message: string) => void;
};

export type DiscoveredPluginLocales = {
  bundles: Record<string, PluginLocaleTree>;
  loadedLanguages: string[];
};

export function canonicalizePluginLocaleTag(locale: string): string | null {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? null;
  } catch {
    return null;
  }
}

export function isPluginLocaleTree(value: unknown): value is PluginLocaleTree {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  for (const child of Object.values(value)) {
    if (typeof child === 'string') continue;
    if (!isPluginLocaleTree(child)) return false;
  }

  return true;
}

export async function discoverPluginLocales(
  pluginId: string,
  deps: DiscoverPluginLocalesDeps = {},
): Promise<DiscoveredPluginLocales> {
  const readFile = deps.readFile ?? readPluginFile;
  const listFiles = deps.listFiles ?? listPluginFiles;
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  const bundles: Record<string, PluginLocaleTree> = {};

  const localeFiles = (await listFiles(pluginId, 'locales'))
    .filter((filePath) => filePath.startsWith('locales/') && filePath.endsWith('.json'))
    .filter((filePath) => filePath.slice('locales/'.length).indexOf('/') === -1)
    .sort((left, right) => left.localeCompare(right));

  for (const filePath of localeFiles) {
    const fileName = filePath.slice('locales/'.length);
    const localeTag = fileName.slice(0, -'.json'.length);
    const canonicalLocale = canonicalizePluginLocaleTag(localeTag);
    if (!canonicalLocale) {
      warn(`[plugin:${pluginId}] Skipping invalid locale file "${fileName}"`);
      continue;
    }

    const raw = await readFile(pluginId, filePath);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(new TextDecoder().decode(raw)) as unknown;
      if (!isPluginLocaleTree(parsed)) {
        warn(`[plugin:${pluginId}] Skipping locale "${canonicalLocale}" because it is not a JSON object tree`);
        continue;
      }
      bundles[canonicalLocale] = parsed;
    } catch {
      warn(`[plugin:${pluginId}] Skipping locale "${canonicalLocale}" because the JSON is invalid`);
    }
  }

  return {
    bundles,
    loadedLanguages: Object.keys(bundles),
  };
}
