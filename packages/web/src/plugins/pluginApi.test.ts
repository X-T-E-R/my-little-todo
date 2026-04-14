import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

vi.mock('../storage/dataStore', () => ({
  getDataStore: () => ({
    getSetting: vi.fn(async () => null),
    putSetting: vi.fn(async () => undefined),
    deleteSetting: vi.fn(async () => undefined),
  }),
}));

vi.mock('./pluginManifest', () => ({
  hasPermission: () => true,
}));

vi.mock('./pluginUiRegistry', () => ({
  registerPluginSettingsPage: vi.fn(),
  unregisterPluginSettingsPage: vi.fn(),
}));

import { createPluginContext, loadLocalesForPlugin, removeLocalesForPlugin } from './pluginApi';

describe('createPluginContext i18n api', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init({
        lng: 'en',
        fallbackLng: 'en',
        resources: {
          en: {},
          ja: {},
        },
      });
    }
    await i18n.changeLanguage('en');
  });

  it('exposes the current language and notifies listeners on language changes', async () => {
    const disposers: Array<() => void> = [];
    const ctx = createPluginContext(
      'demo',
      {
        id: 'demo',
        name: 'Demo',
        version: '0.1.0',
        minAppVersion: '0.5.0',
        permissions: ['ui:settings'],
        entryPoint: 'index.js',
      },
      (dispose) => disposers.push(dispose),
    );

    const handler = vi.fn();
    const subscription = ctx.i18n.onLanguageChanged(handler);

    expect(ctx.i18n.getLanguage()).toBe('en');

    await i18n.changeLanguage('ja');

    expect(ctx.i18n.getLanguage()).toBe('ja');
    expect(handler).toHaveBeenCalledWith('ja');

    subscription.dispose();
    await i18n.changeLanguage('en');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(disposers).toHaveLength(1);
  });

  it('falls back to english plugin locales when the current language bundle is missing', async () => {
    await loadLocalesForPlugin('fallback-demo', {
      en: {
        title: 'Hello fallback',
        nested: {
          cta: 'Run',
        },
      },
    });

    const ctx = createPluginContext(
      'fallback-demo',
      {
        id: 'fallback-demo',
        name: 'Demo',
        version: '0.1.0',
        minAppVersion: '0.5.0',
        permissions: ['ui:settings'],
        entryPoint: 'index.js',
      },
      () => undefined,
    );

    await i18n.changeLanguage('ja');

    expect(ctx.i18n.t('title')).toBe('Hello fallback');
    expect(ctx.i18n.t('nested.cta')).toBe('Run');

    await removeLocalesForPlugin('fallback-demo', ['en']);
  });
});
