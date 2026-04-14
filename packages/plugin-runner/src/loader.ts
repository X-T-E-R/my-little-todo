import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  PluginServerContext,
  PluginServerLogger,
  PluginServerToolResult,
  ServerPluginDefinition,
} from '@my-little-todo/plugin-sdk';
import type { RunnerLaunchConfig } from './types.js';

export interface LoadedServerPlugin {
  context: PluginServerContext;
  definition: ServerPluginDefinition;
}

function createLogger(pluginId: string): PluginServerLogger {
  const prefix = `[plugin-runner:${pluginId}]`;
  return {
    debug: (...args: unknown[]) => console.debug(prefix, ...args),
    info: (...args: unknown[]) => console.info(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
}

function isServerPluginDefinition(value: unknown): value is ServerPluginDefinition {
  return typeof value === 'object' && value !== null;
}

function resolveDefinition(moduleExports: Record<string, unknown>): ServerPluginDefinition {
  const candidate = moduleExports.default ?? moduleExports.plugin;
  if (!isServerPluginDefinition(candidate)) {
    throw new Error(
      'Plugin server entry must export defineServerPlugin(...) as default export or named export "plugin".',
    );
  }
  return candidate;
}

export function normalizeToolResult(result: unknown): PluginServerToolResult {
  if (typeof result === 'object' && result !== null && 'content' in result) {
    return result as PluginServerToolResult;
  }
  return {
    content: result,
  };
}

export async function loadServerPlugin(config: RunnerLaunchConfig): Promise<LoadedServerPlugin> {
  const entryPath = path.resolve(config.pluginRoot, config.entryPoint);
  const moduleExports = (await import(pathToFileURL(entryPath).href)) as Record<string, unknown>;
  const definition = resolveDefinition(moduleExports);
  const context: PluginServerContext = {
    pluginId: config.pluginId,
    logger: createLogger(config.pluginId),
    host: {},
  };

  await definition.activate?.(context);

  return {
    context,
    definition,
  };
}
