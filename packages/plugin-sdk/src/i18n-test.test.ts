import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validatePluginI18n } from './i18n-test';

const tempDirs: string[] = [];

describe('validatePluginI18n', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when referenced keys exist across locales with matching placeholders', () => {
    const rootDir = createFixture({
      'src/index.tsx': `
        export function Demo({ ctx }: { ctx: any }) {
          return <div>{ctx.i18n.t('greeting')} {ctx.i18n.t('count_label')}</div>;
        }
      `,
      'locales/en.json': JSON.stringify({
        greeting: 'Hello',
        count_label: 'Count: {{count}}',
      }),
      'locales/ja.json': JSON.stringify({
        greeting: 'こんにちは',
        count_label: '件数: {{count}}',
      }),
    });

    expect(validatePluginI18n({ rootDir }).issues).toEqual([]);
  });

  it('reports missing keys, invalid locale filenames, and placeholder mismatches', () => {
    const rootDir = createFixture({
      'src/index.tsx': `
        export function Demo({ ctx }: { ctx: any }) {
          const { i18n } = ctx;
          return <div>{i18n.t('title')}{ctx.i18n.t('count_label')}</div>;
        }
      `,
      'locales/en.json': JSON.stringify({
        title: 'Hello',
        count_label: 'Count: {{count}}',
      }),
      'locales/zh-CN.json': JSON.stringify({
        title: '你好',
      }),
      'locales/not a locale.json': JSON.stringify({
        title: 'broken',
      }),
    });

    const result = validatePluginI18n({ rootDir });

    expect(result.issues).toContain('Invalid locale filename: not a locale.json');
    expect(result.issues).toContain(
      'index.tsx:4 missing key "count_label" in locale "zh-CN"',
    );
  });

  it('reports invalid locale JSON and non-object bundles', () => {
    const rootDir = createFixture({
      'src/index.tsx': `
        export function Demo({ ctx }: { ctx: any }) {
          return <div>{ctx.i18n.t('title')}</div>;
        }
      `,
      'locales/en.json': '{"title"',
      'locales/ja.json': JSON.stringify(['bad']),
    });

    const result = validatePluginI18n({ rootDir });

    expect(result.issues).toContain('Invalid locale JSON: en.json');
    expect(result.issues).toContain('Locale bundle must be a JSON object tree: ja.json');
    expect(result.issues).toContain('No locale bundles found under locales/*.json');
  });
});

function createFixture(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'mlt-plugin-i18n-'));
  tempDirs.push(rootDir);

  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = path.join(rootDir, relativePath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }

  return rootDir;
}
