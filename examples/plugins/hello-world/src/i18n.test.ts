import { describe, expect, it } from 'vitest';
import { validatePluginI18n } from '@my-little-todo/plugin-sdk/i18n-test';

describe('hello-world plugin i18n', () => {
  it('keeps locale bundles aligned with the plugin UI copy', () => {
    const result = validatePluginI18n({
      rootDir: process.cwd(),
    });

    expect(result.issues).toEqual([]);
    expect(result.locales).toEqual(['en', 'ja', 'zh-CN']);
  });
});
