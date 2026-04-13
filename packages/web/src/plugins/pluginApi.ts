import type {
  Disposable,
  PluginCommand,
  PluginContext,
  PluginDefinition,
  PluginEventsAPI,
  PluginI18nAPI,
  PluginLogger,
  PluginManifest,
  PluginUIAPI,
  PluginWidget,
} from '@my-little-todo/plugin-sdk';
import i18n from 'i18next';
import type { ComponentType } from 'react';
import { getDataStore } from '../storage/dataStore';
import { hasPermission } from './pluginManifest';
import { registerPluginSettingsPage, unregisterPluginSettingsPage } from './pluginUiRegistry';

export class PluginPermissionError extends Error {
  constructor(perm: string) {
    super(`Plugin permission denied: ${perm}`);
    this.name = 'PluginPermissionError';
  }
}

function assertPerm(manifest: PluginManifest, perm: Parameters<typeof hasPermission>[1]): void {
  if (!hasPermission(manifest, perm)) {
    throw new PluginPermissionError(perm);
  }
}

export function createPluginContext(
  pluginId: string,
  manifest: PluginManifest,
  onDispose: (fn: () => void) => void,
): PluginContext {
  const data = {
    async get(key: string): Promise<string | null> {
      assertPerm(manifest, 'data:read');
      return getDataStore().getSetting(`plugin:${pluginId}:${key}`);
    },
    async set(key: string, value: string): Promise<void> {
      assertPerm(manifest, 'data:write');
      return getDataStore().putSetting(`plugin:${pluginId}:${key}`, value);
    },
    async delete(key: string): Promise<void> {
      assertPerm(manifest, 'data:write');
      return getDataStore().deleteSetting(`plugin:${pluginId}:${key}`);
    },
  };

  const eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>();

  const events: PluginEventsAPI = {
    on(event, handler) {
      let set = eventHandlers.get(event);
      if (!set) {
        set = new Set();
        eventHandlers.set(event, set);
      }
      set.add(handler);
      const dispose = () => {
        set?.delete(handler);
      };
      onDispose(dispose);
      return { dispose };
    },
    off(event, handler) {
      eventHandlers.get(event)?.delete(handler);
    },
  };

  const logger: PluginLogger = {
    debug: (...args: unknown[]) => console.debug(`[plugin:${pluginId}]`, ...args),
    info: (...args: unknown[]) => console.info(`[plugin:${pluginId}]`, ...args),
    warn: (...args: unknown[]) => console.warn(`[plugin:${pluginId}]`, ...args),
    error: (...args: unknown[]) => console.error(`[plugin:${pluginId}]`, ...args),
  };

  const ns = `plugin:${pluginId}`;
  const i18nApi: PluginI18nAPI = {
    t(key, options) {
      return i18n.t(key, { ns, ...options });
    },
  };

  const ui: PluginUIAPI = {
    registerSettingsPage(component: ComponentType<Record<string, never>>): Disposable {
      assertPerm(manifest, 'ui:settings');
      registerPluginSettingsPage(pluginId, component);
      const dispose = () => unregisterPluginSettingsPage(pluginId);
      onDispose(dispose);
      return { dispose };
    },
    registerCommand(cmd: PluginCommand): Disposable {
      assertPerm(manifest, 'ui:command');
      logger.warn('registerCommand: not wired in host yet', cmd.id);
      return { dispose: () => {} };
    },
    registerWidget(widget: PluginWidget): Disposable {
      assertPerm(manifest, 'ui:widget');
      logger.warn('registerWidget: not wired in host yet', widget.id);
      return { dispose: () => {} };
    },
  };

  return {
    pluginId,
    data,
    ui,
    events,
    i18n: i18nApi,
    logger,
  };
}

export async function loadLocalesForPlugin(
  pluginId: string,
  locales: Record<string, Record<string, string>>,
) {
  const ns = `plugin:${pluginId}`;
  for (const [lng, bundle] of Object.entries(locales)) {
    i18n.addResourceBundle(lng, ns, bundle, true, true);
  }
}

export async function removeLocalesForPlugin(pluginId: string, lngs: string[]) {
  const ns = `plugin:${pluginId}`;
  for (const lng of lngs) {
    i18n.removeResourceBundle(lng, ns);
  }
}

export function runPluginActivate(definition: PluginDefinition, ctx: PluginContext): Promise<void> {
  return Promise.resolve(definition.activate(ctx));
}

export function runPluginDeactivate(definition: PluginDefinition): Promise<void> {
  if (definition.deactivate) {
    return Promise.resolve(definition.deactivate());
  }
  return Promise.resolve();
}
