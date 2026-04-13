import type { AppModule } from '../modules/registry';
import { manifestHasSettingsPage } from './pluginManifest';
import type { InstalledPluginRecord } from './types';

/** Map installed plugin records to AppModule rows for settings / module store UI. */
export function installedPluginsToAppModules(
  plugins: Record<string, InstalledPluginRecord>,
): AppModule[] {
  return Object.values(plugins).map((p) => ({
    id: p.manifest.id,
    nameKey: `plugin_name_${p.manifest.id}`,
    descriptionKey: `plugin_desc_${p.manifest.id}`,
    defaultEnabled: true,
    stability: p.stability,
    hasSettingsPage: manifestHasSettingsPage(p.manifest),
    source: 'plugin' as const,
    pluginDisplayName: p.manifest.name,
    pluginDescription: p.manifest.description ?? '',
  }));
}
