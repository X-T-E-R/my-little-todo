import type { PluginDefinition, PluginManifest } from '@my-little-todo/plugin-sdk';
import type { StabilityLevel } from '../modules';

export type { PluginDefinition, PluginManifest };

/** Serialized install record persisted in settings / plugin FS index */
export interface InstalledPluginRecord {
  id: string;
  manifest: PluginManifest;
  installedAt: string;
  enabled: boolean;
  source: 'file' | 'marketplace';
  sourceUrl?: string;
  stability: StabilityLevel;
}

/** Loaded plugin module exports from dynamic import */
export interface PluginModuleExports {
  default?: PluginDefinition;
  plugin?: PluginDefinition;
}

export const INSTALLED_REGISTRY_KEY = 'plugin:_system:installed_registry';
export const REGISTRY_SOURCES_KEY = 'plugin:_registry:sources';
export const REGISTRY_CACHE_PREFIX = 'plugin:_registry:cache:';
export const PLUGIN_DEV_MODE_KEY = 'plugin:_dev:enabled';
export const PLUGIN_DEV_MANIFEST_KEY = 'plugin:_dev:manifest_json';

/** Default marketplace registry URL (raw GitHub); override via settings */
export const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/my-little-todo/plugin-registry/main/registry.json';

export interface RegistryPluginEntry {
  id: string;
  name: string;
  author?: string;
  description?: string;
  version: string;
  minAppVersion: string;
  stability?: StabilityLevel;
  downloadUrl: string;
  homepage?: string;
  tags?: string[];
  updatedAt?: string;
}

export interface PluginRegistryFile {
  schemaVersion: number;
  plugins: RegistryPluginEntry[];
}
