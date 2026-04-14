import { beforeEach, describe, expect, it, vi } from 'vitest';

const pluginApi = vi.hoisted(() => ({
  createPluginContext: vi.fn(() => ({ logger: { warn: vi.fn() } })),
  loadLocalesForPlugin: vi.fn(async () => {}),
  removeLocalesForPlugin: vi.fn(async () => {}),
  runPluginActivate: vi.fn(async () => {}),
  runPluginDeactivate: vi.fn(async () => {}),
}));

const pluginLocales = vi.hoisted(() => ({
  discoverPluginLocales: vi.fn(async () => ({
    bundles: { en: { title: 'Hello' }, ja: { title: 'こんにちは' } },
    loadedLanguages: ['en', 'ja'],
  })),
}));

const pluginFs = vi.hoisted(() => ({
  readPluginFile: vi.fn(async (_pluginId: string, relativePath: string) => {
    if (relativePath === 'index.js') {
      return new TextEncoder().encode('export default { activate() {}, deactivate() {} };');
    }
    return null;
  }),
}));

const pluginUiRegistry = vi.hoisted(() => ({
  clearPluginUi: vi.fn(),
}));

vi.mock('./pluginApi', () => pluginApi);
vi.mock('./pluginLocales', () => pluginLocales);
vi.mock('./pluginFs', () => pluginFs);
vi.mock('./pluginUiRegistry', () => pluginUiRegistry);

import { activatePlugin, deactivatePlugin } from './pluginRuntime';

describe('pluginRuntime', () => {
  const manifest = {
    id: 'demo',
    name: 'Demo',
    version: '0.1.0',
    minAppVersion: '0.5.0',
    permissions: ['ui:settings'] as const,
    entryPoint: 'index.js',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    pluginLocales.discoverPluginLocales.mockResolvedValue({
      bundles: { en: { title: 'Hello' }, ja: { title: 'こんにちは' } },
      loadedLanguages: ['en', 'ja'],
    });
    pluginApi.runPluginActivate.mockResolvedValue(undefined);
    pluginApi.runPluginDeactivate.mockResolvedValue(undefined);
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(
          () => 'data:text/javascript,export default { activate() {}, deactivate() {} };',
        ),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  it('loads arbitrary discovered locales and removes the same set on deactivate', async () => {
    await activatePlugin('demo', manifest);
    await deactivatePlugin('demo');

    expect(pluginLocales.discoverPluginLocales).toHaveBeenCalledWith('demo');
    expect(pluginApi.loadLocalesForPlugin).toHaveBeenCalledWith('demo', {
      en: { title: 'Hello' },
      ja: { title: 'こんにちは' },
    });
    expect(pluginApi.removeLocalesForPlugin).toHaveBeenCalledWith('demo', ['en', 'ja']);
  });

  it('cleans up loaded locales when activation fails after locale injection', async () => {
    pluginApi.runPluginActivate.mockRejectedValue(new Error('boom'));

    await expect(activatePlugin('demo-fail', { ...manifest, id: 'demo-fail' })).rejects.toThrow(
      'boom',
    );

    expect(pluginUiRegistry.clearPluginUi).toHaveBeenCalledWith('demo-fail');
    expect(pluginApi.removeLocalesForPlugin).toHaveBeenCalledWith('demo-fail', ['en', 'ja']);
  });
});
