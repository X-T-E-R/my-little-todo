import { describe, expect, it, vi } from 'vitest';
import {
  canonicalizePluginLocaleTag,
  discoverPluginLocales,
  isPluginLocaleTree,
} from './pluginLocales';

describe('pluginLocales', () => {
  it('canonicalizes valid locale tags and rejects invalid ones', () => {
    expect(canonicalizePluginLocaleTag('fr-fr')).toBe('fr-FR');
    expect(canonicalizePluginLocaleTag('zh-CN')).toBe('zh-CN');
    expect(canonicalizePluginLocaleTag('not a locale')).toBeNull();
  });

  it('validates nested locale bundles', () => {
    expect(isPluginLocaleTree({ title: 'hello', nested: { body: 'world' } })).toBe(true);
    expect(isPluginLocaleTree({ broken: ['nope'] })).toBe(false);
    expect(isPluginLocaleTree('hello')).toBe(false);
  });

  it('discovers arbitrary locale files and skips invalid bundles with warnings', async () => {
    const warn = vi.fn();
    const readFile = vi.fn(async (_pluginId: string, relativePath: string) => {
      const fileMap: Record<string, string> = {
        'locales/en.json': JSON.stringify({ title: 'Hello', nested: { cta: 'Run' } }),
        'locales/ja.json': JSON.stringify({ title: 'こんにちは' }),
        'locales/fr-fr.json': JSON.stringify({ title: 'Bonjour' }),
        'locales/bad.json': '{"title"',
        'locales/de.json': JSON.stringify(['not-an-object']),
      };
      const value = fileMap[relativePath];
      return value ? new TextEncoder().encode(value) : null;
    });
    const listFiles = vi.fn().mockResolvedValue([
      'locales/ja.json',
      'locales/en.json',
      'locales/fr-fr.json',
      'locales/invalid tag.json',
      'locales/bad.json',
      'locales/de.json',
      'locales/nested/ignore.json',
    ]);

    const result = await discoverPluginLocales('demo', { readFile, listFiles, warn });

    expect(result.loadedLanguages).toEqual(['en', 'fr-FR', 'ja']);
    expect(result.bundles['en']).toEqual({ title: 'Hello', nested: { cta: 'Run' } });
    expect(result.bundles['ja']).toEqual({ title: 'こんにちは' });
    expect(result.bundles['fr-FR']).toEqual({ title: 'Bonjour' });
    expect(warn).toHaveBeenCalledWith('[plugin:demo] Skipping invalid locale file "invalid tag.json"');
    expect(warn).toHaveBeenCalledWith(
      '[plugin:demo] Skipping locale "bad" because the JSON is invalid',
    );
    expect(warn).toHaveBeenCalledWith(
      '[plugin:demo] Skipping locale "de" because it is not a JSON object tree',
    );
  });
});
