import type { ComponentType } from 'react';

/** Permissions declared in manifest.json and enforced by the host. */
export type PluginPermission =
  | 'data:read'
  | 'data:write'
  | 'tasks:read'
  | 'stream:read'
  | 'ui:settings'
  | 'ui:command'
  | 'ui:widget'
  | 'ui:panel';

export interface PluginManifestAuthor {
  name: string;
  url?: string;
}

/** Root manifest.json for a .mltp package. */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  stability?: 'stable' | 'beta' | 'experimental';
  author?: PluginManifestAuthor;
  description?: string;
  homepage?: string;
  license?: string;
  permissions: PluginPermission[];
  entryPoint: string;
  styleSheet?: string;
}

export interface Disposable {
  dispose(): void;
}

export interface PluginDataAPI {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PluginCommand {
  id: string;
  label: string;
  run(): void | Promise<void>;
}

export interface PluginWidget {
  id: string;
  label: string;
  component: ComponentType<Record<string, never>>;
}

export interface PluginEventsAPI {
  on(event: string, handler: (...args: unknown[]) => void): Disposable;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

export type PluginLocaleTree = {
  [key: string]: string | PluginLocaleTree;
};

export interface PluginI18nAPI {
  t(key: string, options?: Record<string, string | number>): string;
  getLanguage(): string;
  onLanguageChanged(handler: (language: string) => void): Disposable;
}

export interface PluginLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface PluginUIAPI {
  registerSettingsPage(component: ComponentType<Record<string, never>>): Disposable;
  registerCommand(cmd: PluginCommand): Disposable;
  registerWidget(widget: PluginWidget): Disposable;
}

/** Host-injected context passed to activate(). */
export interface PluginContext {
  pluginId: string;
  data: PluginDataAPI;
  ui: PluginUIAPI;
  events: PluginEventsAPI;
  i18n: PluginI18nAPI;
  logger: PluginLogger;
}

export interface PluginDefinition {
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
