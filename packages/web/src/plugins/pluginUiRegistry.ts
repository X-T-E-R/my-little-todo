import type { ComponentType } from 'react';
import {
  getSettingsEntry,
  registerSettingsEntry,
  subscribeSettingsRegistry,
  unregisterSettingsEntry,
} from '../settings/registry';

export function subscribePluginSettingsUi(cb: () => void): () => void {
  return subscribeSettingsRegistry(cb);
}

export function registerPluginSettingsPage(
  pluginId: string,
  component: ComponentType<Record<string, never>>,
): void {
  registerSettingsEntry({
    id: pluginId,
    source: 'plugin',
    component,
  });
}

export function unregisterPluginSettingsPage(pluginId: string): void {
  unregisterSettingsEntry('plugin', pluginId);
}

export function getPluginSettingsComponent(
  pluginId: string,
): ComponentType<Record<string, never>> | undefined {
  return getSettingsEntry('plugin', pluginId)?.component;
}

export function clearPluginUi(pluginId: string): void {
  unregisterPluginSettingsPage(pluginId);
}
