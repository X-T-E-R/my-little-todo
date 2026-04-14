import { readdirSync, readFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import type { PluginLocaleTree } from './types.js';

type Scope = {
  i18nBindings: Set<string>;
  tBindings: Set<string>;
  stringBindings: Map<string, string[]>;
};

type TranslationUsage = {
  file: string;
  line: number;
  key: string;
};

export interface PluginI18nValidationOptions {
  rootDir?: string;
  sourceDir?: string;
  localesDir?: string;
  fallbackLocale?: string | null;
}

export interface PluginI18nValidationResult {
  issues: string[];
  referencedKeys: string[];
  locales: string[];
}

type LocaleCatalog = {
  entries: Map<string, string>;
  locale: string;
};

export function validatePluginI18n(
  options: PluginI18nValidationOptions = {},
): PluginI18nValidationResult {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const sourceDir = path.resolve(rootDir, options.sourceDir ?? 'src');
  const localesDir = path.resolve(rootDir, options.localesDir ?? 'locales');
  const fallbackLocale = options.fallbackLocale === undefined ? 'en' : options.fallbackLocale;

  const localeIssues: string[] = [];
  const locales = loadLocales(localesDir, localeIssues);
  const usages = collectSourceFiles(sourceDir).flatMap((filePath) => collectUsages(filePath, sourceDir));
  const usageIssues = validateUsages(usages, locales, fallbackLocale);

  return {
    issues: [...localeIssues, ...usageIssues],
    referencedKeys: Array.from(new Set(usages.map((usage) => usage.key))).sort((a, b) =>
      a.localeCompare(b),
    ),
    locales: Array.from(locales.keys()).sort((a, b) => a.localeCompare(b)),
  };
}

function loadLocales(localesDir: string, issues: string[]): Map<string, LocaleCatalog> {
  const catalogs = new Map<string, LocaleCatalog>();
  let fileNames: string[] = [];

  try {
    fileNames = readdirSync(localesDir);
  } catch {
    return catalogs;
  }

  for (const fileName of fileNames.sort((left, right) => left.localeCompare(right))) {
    if (!fileName.endsWith('.json')) continue;

    const rawLocale = fileName.slice(0, -'.json'.length);
    const locale = canonicalizeLocale(rawLocale);
    if (!locale) {
      issues.push(`Invalid locale filename: ${fileName}`);
      continue;
    }

    const fullPath = path.join(localesDir, fileName);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(fullPath, 'utf8'));
    } catch {
      issues.push(`Invalid locale JSON: ${fileName}`);
      continue;
    }

    if (!isPluginLocaleTree(parsed)) {
      issues.push(`Locale bundle must be a JSON object tree: ${fileName}`);
      continue;
    }

    if (catalogs.has(locale)) {
      issues.push(`Duplicate locale bundle after canonicalization: ${fileName} -> ${locale}`);
      continue;
    }

    catalogs.set(locale, {
      locale,
      entries: flattenLocaleTree(parsed),
    });
  }

  return catalogs;
}

function collectSourceFiles(root: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    let entries: Dirent<string>[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!['.ts', '.tsx'].includes(path.extname(entry.name))) continue;
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
      if (entry.name.endsWith('.d.ts')) continue;
      files.push(fullPath);
    }
  }

  walk(root);
  return files;
}

function collectUsages(filePath: string, sourceRoot: string): TranslationUsage[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const usages: TranslationUsage[] = [];

  visitNode(sourceFile, createScope(), sourceFile, usages, sourceRoot);
  return usages;
}

function visitNode(
  node: ts.Node,
  incomingScope: Scope,
  sourceFile: ts.SourceFile,
  usages: TranslationUsage[],
  sourceRoot: string,
): void {
  const scope = createsScope(node) ? cloneScope(incomingScope) : incomingScope;

  if (ts.isVariableDeclaration(node)) {
    registerBindings(node, scope);
  }

  if (ts.isCallExpression(node)) {
    collectCallUsage(node, scope, sourceFile, usages, sourceRoot);
  }

  ts.forEachChild(node, (child) => visitNode(child, scope, sourceFile, usages, sourceRoot));
}

function registerBindings(node: ts.VariableDeclaration, scope: Scope): void {
  if (!node.initializer) return;

  const initializer = unwrapExpression(node.initializer);
  if (ts.isIdentifier(node.name)) {
    const values = resolveStringValues(initializer, scope);
    if (values && values.length > 0) {
      scope.stringBindings.set(node.name.text, values);
    }
    if (
      ts.isPropertyAccessExpression(initializer) &&
      ts.isIdentifier(initializer.name) &&
      initializer.name.text === 'i18n'
    ) {
      scope.i18nBindings.add(node.name.text);
    }
  }

  if (!ts.isObjectBindingPattern(node.name)) return;

  if (
    ts.isPropertyAccessExpression(initializer) &&
    ts.isIdentifier(initializer.name) &&
    initializer.name.text === 'i18n'
  ) {
    for (const element of node.name.elements) {
      const propertyName = element.propertyName ?? element.name;
      if (!ts.isIdentifier(propertyName) || !ts.isIdentifier(element.name)) continue;
      if (propertyName.text === 't') scope.tBindings.add(element.name.text);
    }
    return;
  }

  for (const element of node.name.elements) {
    const propertyName = element.propertyName ?? element.name;
    if (!ts.isIdentifier(propertyName) || !ts.isIdentifier(element.name)) continue;
    if (propertyName.text === 'i18n') {
      scope.i18nBindings.add(element.name.text);
    }
  }
}

function collectCallUsage(
  node: ts.CallExpression,
  scope: Scope,
  sourceFile: ts.SourceFile,
  usages: TranslationUsage[],
  sourceRoot: string,
): void {
  const keys = resolveStringValues(node.arguments[0], scope);
  if (!keys || keys.length === 0) return;

  if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 't') {
    if (
      ts.isPropertyAccessExpression(node.expression.expression) &&
      ts.isIdentifier(node.expression.expression.name) &&
      node.expression.expression.name.text === 'i18n'
    ) {
      pushUsages(keys, sourceFile, node, usages, sourceRoot);
      return;
    }

    if (
      ts.isIdentifier(node.expression.expression) &&
      scope.i18nBindings.has(node.expression.expression.text)
    ) {
      pushUsages(keys, sourceFile, node, usages, sourceRoot);
      return;
    }
  }

  if (ts.isIdentifier(node.expression) && scope.tBindings.has(node.expression.text)) {
    pushUsages(keys, sourceFile, node, usages, sourceRoot);
  }
}

function pushUsages(
  keys: string[],
  sourceFile: ts.SourceFile,
  node: ts.Node,
  usages: TranslationUsage[],
  sourceRoot: string,
): void {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  for (const key of keys) {
    usages.push({
      file: path.relative(sourceRoot, sourceFile.fileName),
      line: line + 1,
      key,
    });
  }
}

function validateUsages(
  usages: TranslationUsage[],
  locales: Map<string, LocaleCatalog>,
  fallbackLocale: string | null,
): string[] {
  const issues: string[] = [];
  const localeNames = Array.from(locales.keys()).sort((a, b) => a.localeCompare(b));

  if (usages.length > 0 && localeNames.length === 0) {
    issues.push('No locale bundles found under locales/*.json');
    return issues;
  }

  for (const usage of usages) {
    const presentLocales = localeNames.filter((locale) => locales.get(locale)?.entries.has(usage.key));
    if (presentLocales.length === 0) {
      issues.push(`${usage.file}:${usage.line} missing key "${usage.key}" from all locale bundles`);
      continue;
    }

    for (const locale of localeNames) {
      if (!locales.get(locale)?.entries.has(usage.key)) {
        issues.push(`${usage.file}:${usage.line} missing key "${usage.key}" in locale "${locale}"`);
      }
    }

    const expected = getExpectedPlaceholders(usage.key, locales, fallbackLocale);
    if (!expected) continue;

    for (const locale of presentLocales) {
      const translation = locales.get(locale)?.entries.get(usage.key);
      if (!translation) continue;
      const actual = extractPlaceholders(translation);
      if (!sameSet(expected, actual)) {
        issues.push(
          `${usage.file}:${usage.line} placeholder mismatch for "${usage.key}" in locale "${locale}" (expected: ${joinSet(expected)}, actual: ${joinSet(actual)})`,
        );
      }
    }
  }

  return Array.from(new Set(issues));
}

function getExpectedPlaceholders(
  key: string,
  locales: Map<string, LocaleCatalog>,
  fallbackLocale: string | null,
): Set<string> | undefined {
  if (key.includes('{{')) {
    return extractPlaceholders(key);
  }

  if (fallbackLocale) {
    const fallbackEntry = locales.get(fallbackLocale)?.entries.get(key);
    if (fallbackEntry !== undefined) return extractPlaceholders(fallbackEntry);
  }

  for (const locale of locales.values()) {
    const translation = locale.entries.get(key);
    if (translation !== undefined) return extractPlaceholders(translation);
  }

  return undefined;
}

function resolveStringValues(node: ts.Node | undefined, scope: Scope): string[] | undefined {
  if (!node) return undefined;
  const target = unwrapExpression(node);

  if (ts.isStringLiteral(target) || ts.isNoSubstitutionTemplateLiteral(target)) {
    return [target.text];
  }
  if (ts.isIdentifier(target)) {
    return scope.stringBindings.get(target.text);
  }

  return undefined;
}

function flattenLocaleTree(source: PluginLocaleTree, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(source)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      entries.set(nextKey, value);
      continue;
    }
    const nested = flattenLocaleTree(value, nextKey);
    for (const [nestedKey, nestedValue] of nested) {
      entries.set(nestedKey, nestedValue);
    }
  }
  return entries;
}

function canonicalizeLocale(locale: string): string | null {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? null;
  } catch {
    return null;
  }
}

function isPluginLocaleTree(value: unknown): value is PluginLocaleTree {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const child of Object.values(value)) {
    if (typeof child === 'string') continue;
    if (!isPluginLocaleTree(child)) return false;
  }
  return true;
}

function extractPlaceholders(value: string): Set<string> {
  const matches = value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g);
  return new Set(
    Array.from(matches, ([, match]) => (typeof match === 'string' ? match.trim() : '')),
  );
}

function sameSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function joinSet(values: Set<string>): string {
  return values.size > 0 ? Array.from(values).sort().join(', ') : '(none)';
}

function unwrapExpression(node: ts.Node): ts.Node {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function createsScope(node: ts.Node): boolean {
  return ts.isSourceFile(node) || ts.isBlock(node) || ts.isFunctionLike(node);
}

function createScope(): Scope {
  return {
    i18nBindings: new Set(),
    tBindings: new Set(),
    stringBindings: new Map(),
  };
}

function cloneScope(scope: Scope): Scope {
  return {
    i18nBindings: new Set(scope.i18nBindings),
    tBindings: new Set(scope.tBindings),
    stringBindings: new Map(scope.stringBindings),
  };
}
