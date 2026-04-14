import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginManifest } from '@my-little-todo/plugin-sdk';

const httpClient = vi.hoisted(() => ({
  request: vi.fn(async (request: { method?: string }) => ({
    status: 200,
    ok: true,
    headers: {},
    text: async () => '',
    json: async () => ({}),
    request,
  })),
}));

vi.mock('../utils/httpClient', () => ({
  createHttpClient: () => httpClient,
}));

vi.mock('../utils/platform', () => ({
  isTauriEnv: vi.fn(() => true),
}));

vi.mock('../storage/settingsApi', () => ({
  getSettingsApiBase: () => '',
}));

vi.mock('../stores/authStore', () => ({
  getAuthToken: () => null,
}));

import {
  reconcilePluginServerRuntime,
  setPluginServerLauncherForTests,
} from './pluginServerRuntime';

describe('pluginServerRuntime', () => {
  const updates: Array<{ pluginId: string; patch: Record<string, unknown> }> = [];

  const manifest: PluginManifest = {
    id: 'demo-server',
    name: 'Demo Server',
    version: '0.1.0',
    minAppVersion: '0.1.0',
    permissions: ['server:run', 'mcp:expose', 'http:expose'],
    entryPoint: 'index.js',
    server: {
      entryPoint: 'server.js',
      capabilities: ['mcp', 'http'],
      mcpTools: [{ name: 'echo', description: 'Echo', permission: 'read' }],
      httpRoutes: [{ path: '/echo', method: 'GET' }],
    },
  };

  beforeEach(() => {
    updates.length = 0;
    httpClient.request.mockClear();
    setPluginServerLauncherForTests(null);
  });

  it('transitions approved plugins from starting to running and registers extension routes', async () => {
    let exitHandler: ((reason?: string) => void) | undefined;
    const stop = vi.fn(async () => {});
    setPluginServerLauncherForTests(async () => ({
      baseUrl: 'http://127.0.0.1:4011',
      token: 'runner-token-1',
      stop,
      onExit(callback) {
        exitHandler = callback;
        return () => {
          exitHandler = undefined;
        };
      },
    }));

    await reconcilePluginServerRuntime(
      {
        id: 'demo-server',
        manifest,
        installedAt: '2026-04-14T00:00:00.000Z',
        enabled: true,
        source: 'file',
        stability: 'beta',
        serverApproved: true,
        serverStatus: 'inactive',
      },
      async (pluginId, patch) => {
        updates.push({ pluginId, patch });
      },
    );

    expect(updates[0]).toEqual({
      pluginId: 'demo-server',
      patch: { serverStatus: 'starting', serverLastError: undefined },
    });
    expect(updates.at(-1)).toEqual({
      pluginId: 'demo-server',
      patch: { serverStatus: 'running', serverLastError: undefined },
    });
    expect(httpClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'http://127.0.0.1:23981/api/plugins/extensions/register',
        bodyText: expect.stringContaining('"runnerToken":"runner-token-1"'),
      }),
    );

    exitHandler?.('runner crashed');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(httpClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: 'http://127.0.0.1:23981/api/plugins/extensions/demo-server',
      }),
    );
    expect(updates.at(-1)).toEqual({
      pluginId: 'demo-server',
      patch: { serverStatus: 'unavailable', serverLastError: 'runner crashed' },
    });
    expect(stop).not.toHaveBeenCalled();
  });

  it('stops active runners and resets status when the plugin is disabled', async () => {
    const stop = vi.fn(async () => {});
    setPluginServerLauncherForTests(async () => ({
      baseUrl: 'http://127.0.0.1:4012',
      stop,
    }));

    const updateState = async (pluginId: string, patch: Record<string, unknown>) => {
      updates.push({ pluginId, patch });
    };

    await reconcilePluginServerRuntime(
      {
        id: 'demo-server',
        manifest,
        installedAt: '2026-04-14T00:00:00.000Z',
        enabled: true,
        source: 'file',
        stability: 'beta',
        serverApproved: true,
        serverStatus: 'inactive',
      },
      updateState,
    );

    await reconcilePluginServerRuntime(
      {
        id: 'demo-server',
        manifest,
        installedAt: '2026-04-14T00:00:00.000Z',
        enabled: false,
        source: 'file',
        stability: 'beta',
        serverApproved: true,
        serverStatus: 'running',
      },
      updateState,
    );

    expect(stop).toHaveBeenCalledTimes(1);
    expect(httpClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: 'http://127.0.0.1:23981/api/plugins/extensions/demo-server',
      }),
    );
    expect(updates.at(-1)).toEqual({
      pluginId: 'demo-server',
      patch: { serverStatus: 'inactive', serverLastError: undefined },
    });
  });
});
