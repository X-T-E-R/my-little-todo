import type { PluginManifest } from '@my-little-todo/plugin-sdk';
import { getAuthToken } from '../stores/authStore';
import { getSettingsApiBase } from '../storage/settingsApi';
import { createHttpClient } from '../utils/httpClient';
import { isTauriEnv } from '../utils/platform';
import type { InstalledPluginRecord } from './types';

const TAURI_EMBEDDED_SERVER_BASE = 'http://127.0.0.1:23981';

export type ServerRuntimePatch = Pick<
  InstalledPluginRecord,
  'serverStatus' | 'serverLastError'
>;

export type UpdatePluginServerState = (
  pluginId: string,
  patch: ServerRuntimePatch,
) => Promise<void>;

export interface PluginServerController {
  baseUrl: string;
  token?: string;
  stop(): Promise<void>;
  onExit?(callback: (reason?: string) => void): () => void;
}

export interface PluginServerLaunchOptions {
  pluginId: string;
  manifest: PluginManifest;
  entryPoint: string;
  pluginRoot: string;
}

type PluginServerLauncher = (
  options: PluginServerLaunchOptions,
) => Promise<PluginServerController>;

type ActiveRunner = {
  controller: PluginServerController;
  disposeExit?: () => void;
  instanceId: string;
};

const activeRunners = new Map<string, ActiveRunner>();

let launcherOverride: PluginServerLauncher | null = null;

function defaultLauncher(_options: PluginServerLaunchOptions): Promise<PluginServerController> {
  return Promise.reject(
    new Error('No bundled plugin server runner is available in this build yet.'),
  );
}

function getLauncher(): PluginServerLauncher {
  return launcherOverride ?? defaultLauncher;
}

export function setPluginServerLauncherForTests(
  launcher: PluginServerLauncher | null,
): void {
  launcherOverride = launcher;
}

function serverApiBase(): string {
  if (isTauriEnv()) return TAURI_EMBEDDED_SERVER_BASE;
  const apiBase = getSettingsApiBase().replace(/\/$/, '');
  if (apiBase) return apiBase;
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function registerExtension(
  record: InstalledPluginRecord,
  baseUrl: string,
  runnerToken?: string,
): Promise<void> {
  const server = record.manifest.server;
  if (!server) return;
  const httpClient = createHttpClient();
  const response = await httpClient.request({
    url: `${serverApiBase()}/api/plugins/extensions/register`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    bodyText: JSON.stringify({
      pluginId: record.id,
      status: 'running',
      proxyBaseUrl: baseUrl,
      runnerToken,
      mcpTools: (server.mcpTools ?? []).map((tool) => ({
        name: normalizeDeclaredToolName(record.id, tool.name),
        description: tool.description,
        permission: tool.permission,
      })),
      httpRoutes: (server.httpRoutes ?? []).map((route) => ({
        path: route.path,
        method: route.method,
      })),
    }),
    timeoutMs: 10_000,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function unregisterExtension(pluginId: string): Promise<void> {
  const httpClient = createHttpClient();
  const response = await httpClient.request({
    url: `${serverApiBase()}/api/plugins/extensions/${encodeURIComponent(pluginId)}`,
    method: 'DELETE',
    headers: authHeaders(),
    timeoutMs: 10_000,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

function normalizeDeclaredToolName(pluginId: string, toolName: string): string {
  const prefix = `plugin.${pluginId}.`;
  if (toolName.startsWith(prefix)) {
    return toolName.slice(prefix.length);
  }
  return toolName;
}

function nextInstanceId(pluginId: string): string {
  return `${pluginId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

async function clearActiveRunner(pluginId: string): Promise<void> {
  const active = activeRunners.get(pluginId);
  if (!active) return;
  active.disposeExit?.();
  activeRunners.delete(pluginId);
}

async function handleRunnerExit(
  pluginId: string,
  instanceId: string,
  updateState: UpdatePluginServerState,
  reason?: string,
): Promise<void> {
  const active = activeRunners.get(pluginId);
  if (!active || active.instanceId != instanceId) return;
  await clearActiveRunner(pluginId);
  try {
    await unregisterExtension(pluginId);
  } catch {
    /* ignore unregister drift on exit */
  }
  await updateState(pluginId, {
    serverStatus: 'unavailable',
    serverLastError: reason || 'Plugin server runner exited unexpectedly.',
  });
}

export async function stopPluginServerRuntime(pluginId: string): Promise<void> {
  const active = activeRunners.get(pluginId);
  if (!active) {
    try {
      await unregisterExtension(pluginId);
    } catch {
      /* ignore */
    }
    return;
  }
  await clearActiveRunner(pluginId);
  try {
    await unregisterExtension(pluginId);
  } catch {
    /* ignore */
  }
  await active.controller.stop();
}

export async function reconcilePluginServerRuntime(
  record: InstalledPluginRecord,
  updateState: UpdatePluginServerState,
): Promise<void> {
  if (!record.manifest.server) return;

  if (!record.enabled || !record.serverApproved) {
    await stopPluginServerRuntime(record.id);
    await updateState(record.id, {
      serverStatus: 'inactive',
      serverLastError: undefined,
    });
    return;
  }

  if (!isTauriEnv()) {
    await stopPluginServerRuntime(record.id);
    await updateState(record.id, {
      serverStatus: 'unavailable',
      serverLastError: 'Server plugins are only supported in the Tauri desktop host.',
    });
    return;
  }

  const active = activeRunners.get(record.id);
  if (active) {
    await updateState(record.id, {
      serverStatus: 'running',
      serverLastError: undefined,
    });
    return;
  }

  await updateState(record.id, {
    serverStatus: 'starting',
    serverLastError: undefined,
  });

  const instanceId = nextInstanceId(record.id);
  try {
    const controller = await getLauncher()({
      pluginId: record.id,
      manifest: record.manifest,
      entryPoint: record.manifest.server.entryPoint,
      pluginRoot: record.id,
    });
    const disposeExit = controller.onExit?.((reason) => {
      void handleRunnerExit(record.id, instanceId, updateState, reason);
    });
    activeRunners.set(record.id, { controller, disposeExit, instanceId });
    await registerExtension(record, controller.baseUrl, controller.token);
    await updateState(record.id, {
      serverStatus: 'running',
      serverLastError: undefined,
    });
  } catch (error) {
    await clearActiveRunner(record.id);
    try {
      await unregisterExtension(record.id);
    } catch {
      /* ignore */
    }
    await updateState(record.id, {
      serverStatus: 'unavailable',
      serverLastError: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function reconcilePluginServerRuntimes(
  records: InstalledPluginRecord[],
  updateState: UpdatePluginServerState,
): Promise<void> {
  const expectedIds = new Set(
    records.filter((record) => !!record.manifest.server).map((record) => record.id),
  );
  for (const pluginId of [...activeRunners.keys()]) {
    if (!expectedIds.has(pluginId)) {
      await stopPluginServerRuntime(pluginId);
    }
  }
  for (const record of records) {
    await reconcilePluginServerRuntime(record, updateState);
  }
}
