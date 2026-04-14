import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, it } from 'vitest';

type Scope = {
  tBindings: Map<string, string[]>;
  stringSets: Map<string, string[]>;
};

type TranslationUsage = {
  file: string;
  line: number;
  key: string;
  namespaces: string[];
  source: 't' | 'i18n.t' | 'Trans';
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcRoot = path.resolve(__dirname, '..');
const localesRoot = path.resolve(__dirname, 'zh-CN');
const fallbackLocalesRoot = path.resolve(__dirname, 'en');
const localesIndexFile = path.resolve(__dirname, 'index.ts');
const defaultNamespace = 'common';

describe('i18n integrity', () => {
  it('keeps literal translation usage aligned with zh-CN resources', () => {
    const locales = loadLocaleCatalog(localesRoot);
    const fallbackLocales = loadLocaleCatalog(fallbackLocalesRoot);
    const registeredNamespaces = loadRegisteredNamespaces(localesIndexFile);
    const sourceFiles = collectSourceFiles(srcRoot);
    const usages = sourceFiles.flatMap((filePath) => collectUsages(filePath));

    const issues = [
      ...validateNamespaceRegistration(locales, registeredNamespaces),
      ...validateUsages(usages, locales, fallbackLocales, registeredNamespaces),
    ];

    if (issues.length > 0) {
      throw new Error(formatIssues(issues));
    }
  }, 15000);
});

function loadLocaleCatalog(root: string): Map<string, Map<string, string>> {
  const catalog = new Map<string, Map<string, string>>();

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name) !== '.json') continue;

    const namespace = path.basename(entry.name, '.json');
    const fullPath = path.join(root, entry.name);
    const content = JSON.parse(readFileSync(fullPath, 'utf8')) as Record<string, unknown>;
    catalog.set(namespace, flattenLocaleEntries(content));
  }

  return catalog;
}

function loadRegisteredNamespaces(indexFile: string): Set<string> {
  const sourceText = readFileSync(indexFile, 'utf8');
  const sourceFile = ts.createSourceFile(indexFile, sourceText, ts.ScriptTarget.Latest, true);

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'resources') continue;
      const resourcesObject = asObjectLiteral(declaration.initializer);
      if (!resourcesObject) continue;

      for (const property of resourcesObject.properties) {
        if (!ts.isPropertyAssignment(property) || getPropertyName(property.name) !== 'zh-CN') continue;
        const zhObject = asObjectLiteral(property.initializer);
        if (!zhObject) continue;
        return new Set(
          zhObject.properties
            .map((child) => (ts.isPropertyAssignment(child) ? getPropertyName(child.name) : undefined))
            .filter((value): value is string => Boolean(value)),
        );
      }
    }
  }

  throw new Error('Unable to parse zh-CN namespaces from locales/index.ts');
}

function collectSourceFiles(root: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'locales') continue;
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!['.ts', '.tsx'].includes(path.extname(entry.name))) continue;
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
    if (entry.name.endsWith('.d.ts')) continue;

    files.push(fullPath);
  }

  return files;
}

function collectUsages(filePath: string): TranslationUsage[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const usages: TranslationUsage[] = [];

  visitNode(sourceFile, createScope(), sourceFile, usages);
  return usages;
}

function visitNode(
  node: ts.Node,
  incomingScope: Scope,
  sourceFile: ts.SourceFile,
  usages: TranslationUsage[],
): void {
  const scope = createsScope(node) ? cloneScope(incomingScope) : incomingScope;

  if (ts.isVariableDeclaration(node)) {
    registerTranslationBinding(node, scope);
    registerStringSet(node, scope);
  }

  if (ts.isCallExpression(node)) {
    if (visitMappedCallback(node, scope, sourceFile, usages)) return;
    collectCallUsage(node, scope, sourceFile, usages);
  }

  if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
    collectTransUsage(node, sourceFile, usages);
  }

  ts.forEachChild(node, (child) => visitNode(child, scope, sourceFile, usages));
}

function registerTranslationBinding(node: ts.VariableDeclaration, scope: Scope): void {
  const initializer = node.initializer;
  if (!ts.isObjectBindingPattern(node.name) || !initializer || !ts.isCallExpression(initializer)) {
    return;
  }
  if (!ts.isIdentifier(initializer.expression) || initializer.expression.text !== 'useTranslation') {
    return;
  }

  const namespaces = extractNamespaceList(initializer.arguments[0]) ?? [defaultNamespace];
  for (const element of node.name.elements) {
    const originalName = element.propertyName ?? element.name;
    if (!ts.isIdentifier(originalName) || originalName.text !== 't') continue;
    if (!ts.isIdentifier(element.name)) continue;
    scope.tBindings.set(element.name.text, namespaces);
  }
}

function registerStringSet(node: ts.VariableDeclaration, scope: Scope): void {
  if (!ts.isIdentifier(node.name) || !node.initializer) return;
  const values = resolveStringValues(node.initializer, scope);
  if (values && values.length > 0) {
    scope.stringSets.set(node.name.text, values);
  }
}

function visitMappedCallback(
  node: ts.CallExpression,
  scope: Scope,
  sourceFile: ts.SourceFile,
  usages: TranslationUsage[],
): boolean {
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'map') return false;
  const callback = node.arguments[0];
  if (!callback || !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) return false;
  const firstParam = callback.parameters[0];
  if (!firstParam || !ts.isIdentifier(firstParam.name)) return false;

  const iterableValues = resolveStringValues(node.expression.expression, scope);
  if (!iterableValues || iterableValues.length === 0) return false;

  visitNode(node.expression.expression, scope, sourceFile, usages);
  const callbackScope = cloneScope(scope);
  callbackScope.stringSets.set(firstParam.name.text, iterableValues);
  visitNode(callback.body, callbackScope, sourceFile, usages);

  for (const argument of node.arguments.slice(1)) {
    visitNode(argument, scope, sourceFile, usages);
  }

  return true;
}

function collectCallUsage(
  node: ts.CallExpression,
  scope: Scope,
  sourceFile: ts.SourceFile,
  usages: TranslationUsage[],
): void {
  const keyValues = resolveStringValues(node.arguments[0], scope);
  if (!keyValues || keyValues.length === 0) return;

  const location = getLocation(sourceFile, node);
  const optionNamespaces = extractNamespaceList(node.arguments[1], scope);

  if (ts.isIdentifier(node.expression) && scope.tBindings.has(node.expression.text)) {
    const boundNamespaces = scope.tBindings.get(node.expression.text) ?? [defaultNamespace];
    const namespaces = optionNamespaces ?? boundNamespaces;
    for (const key of keyValues) {
      const resolved = normalizeQualifiedKey(key, namespaces);
      usages.push({ ...location, ...resolved, source: 't' });
    }
    return;
  }

  if (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'i18n' &&
    node.expression.name.text === 't'
  ) {
    const namespaces = optionNamespaces ?? [defaultNamespace];
    for (const key of keyValues) {
      const resolved = normalizeQualifiedKey(key, namespaces);
      usages.push({ ...location, ...resolved, source: 'i18n.t' });
    }
  }
}

function collectTransUsage(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  sourceFile: ts.SourceFile,
  usages: TranslationUsage[],
): void {
  if (!ts.isIdentifier(node.tagName) || node.tagName.text !== 'Trans') return;

  const key = getJsxAttributeValue(node.attributes, 'i18nKey');
  if (!key) return;

  const namespaces = getJsxAttributeValue(node.attributes, 'ns');
  const resolved = normalizeQualifiedKey(key, namespaces ? [namespaces] : [defaultNamespace]);
  usages.push({ ...getLocation(sourceFile, node), ...resolved, source: 'Trans' });
}

function validateNamespaceRegistration(
  locales: Map<string, Map<string, string>>,
  registeredNamespaces: Set<string>,
): string[] {
  const issues: string[] = [];

  for (const namespace of locales.keys()) {
    if (!registeredNamespaces.has(namespace)) {
      issues.push(`Missing zh-CN namespace registration in locales/index.ts: ${namespace}`);
    }
  }

  for (const namespace of registeredNamespaces) {
    if (!locales.has(namespace)) {
      issues.push(`Registered zh-CN namespace has no locale file: ${namespace}`);
    }
  }

  return issues;
}

function validateUsages(
  usages: TranslationUsage[],
  locales: Map<string, Map<string, string>>,
  fallbackLocales: Map<string, Map<string, string>>,
  registeredNamespaces: Set<string>,
): string[] {
  const issues: string[] = [];

  for (const usage of usages) {
    const candidateTranslations: string[] = [];

    for (const namespace of usage.namespaces) {
      if (!registeredNamespaces.has(namespace)) {
        issues.push(formatUsage(usage, `references unregistered namespace "${namespace}"`));
        continue;
      }

      const namespaceEntries = locales.get(namespace);
      if (!namespaceEntries) {
        issues.push(formatUsage(usage, `references missing locale namespace "${namespace}"`));
        continue;
      }

      const translated = namespaceEntries.get(usage.key);
      if (translated !== undefined) {
        candidateTranslations.push(translated);
      }
    }

    if (candidateTranslations.length === 0) {
      issues.push(
        formatUsage(
          usage,
          `is missing from zh-CN namespaces [${usage.namespaces.join(', ')}] for key "${usage.key}"`,
        ),
      );
      continue;
    }

    const expected = getExpectedPlaceholders(usage, fallbackLocales);
    if (!expected) continue;
    const actual = extractPlaceholders(candidateTranslations[0]);
    if (!sameSet(expected, actual)) {
      issues.push(
        formatUsage(
          usage,
          `has placeholder mismatch for key "${usage.key}" (expected: ${joinSet(expected)}, actual: ${joinSet(actual)})`,
        ),
      );
    }
  }

  return dedupe(issues);
}

function getExpectedPlaceholders(
  usage: TranslationUsage,
  fallbackLocales: Map<string, Map<string, string>>,
): Set<string> | undefined {
  if (usage.key.includes('{{')) {
    return extractPlaceholders(usage.key);
  }

  for (const namespace of usage.namespaces) {
    const fallbackValue = fallbackLocales.get(namespace)?.get(usage.key);
    if (fallbackValue) {
      return extractPlaceholders(fallbackValue);
    }
  }

  return undefined;
}

function flattenLocaleEntries(source: Record<string, unknown>, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>();

  for (const [key, value] of Object.entries(source)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      flat.set(nextKey, value);
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = flattenLocaleEntries(value as Record<string, unknown>, nextKey);
      for (const [nestedKey, nestedValue] of nested) {
        flat.set(nestedKey, nestedValue);
      }
    }
  }

  return flat;
}

function resolveStringValues(node: ts.Node | undefined, scope: Scope): string[] | undefined {
  if (!node) return undefined;

  const target = unwrapExpression(node);
  if (ts.isStringLiteral(target) || ts.isNoSubstitutionTemplateLiteral(target)) {
    return [target.text];
  }
  if (ts.isIdentifier(target)) {
    return scope.stringSets.get(target.text);
  }
  if (ts.isArrayLiteralExpression(target)) {
    return target.elements.flatMap((element) => resolveStringValues(element, scope) ?? []);
  }
  if (ts.isTemplateExpression(target)) {
    let values = [target.head.text];
    for (const span of target.templateSpans) {
      const segmentValues = resolveStringValues(span.expression, scope);
      if (!segmentValues || segmentValues.length === 0) return undefined;
      values = combineTemplate(values, segmentValues, span.literal.text);
    }
    return values;
  }

  return undefined;
}

function extractNamespaceList(node: ts.Node | undefined, scope = createScope()): string[] | undefined {
  if (!node) return undefined;
  const target = unwrapExpression(node);

  if (ts.isObjectLiteralExpression(target)) {
    for (const property of target.properties) {
      if (!ts.isPropertyAssignment(property) || getPropertyName(property.name) !== 'ns') continue;
      return resolveStringValues(property.initializer, scope);
    }
    return undefined;
  }

  return resolveStringValues(target, scope);
}

function normalizeQualifiedKey(
  rawKey: string,
  namespaces: string[],
): Pick<TranslationUsage, 'key' | 'namespaces'> {
  return { key: rawKey, namespaces };
}

function extractPlaceholders(value: string): Set<string> {
  const matches = value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g);
  return new Set(Array.from(matches, ([, match]) => match.trim()));
}

function getJsxAttributeValue(attributes: ts.JsxAttributes, name: string): string | undefined {
  for (const attribute of attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || getJsxAttributeName(attribute.name) !== name || !attribute.initializer) {
      continue;
    }
    const initializer = attribute.initializer;
    if (ts.isStringLiteral(initializer)) return initializer.text;
    if (ts.isJsxExpression(initializer) && initializer.expression) {
      return resolveStringValues(initializer.expression, createScope())?.[0];
    }
  }

  return undefined;
}

function getJsxAttributeName(name: ts.JsxAttributeName): string | undefined {
  return ts.isIdentifier(name) ? name.text : undefined;
}

function createsScope(node: ts.Node): boolean {
  return ts.isSourceFile(node) || ts.isBlock(node) || ts.isFunctionLike(node);
}

function cloneScope(scope: Scope): Scope {
  return {
    tBindings: new Map(scope.tBindings),
    stringSets: new Map(scope.stringSets),
  };
}

function createScope(): Scope {
  return {
    tBindings: new Map(),
    stringSets: new Map(),
  };
}

function unwrapExpression(node: ts.Node): ts.Expression {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current as ts.Expression;
}

function asObjectLiteral(node: ts.Node | undefined): ts.ObjectLiteralExpression | undefined {
  const target = node ? unwrapExpression(node) : undefined;
  return target && ts.isObjectLiteralExpression(target) ? target : undefined;
}

function getPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function getLocation(sourceFile: ts.SourceFile, node: ts.Node): Pick<TranslationUsage, 'file' | 'line'> {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { file: path.relative(srcRoot, sourceFile.fileName), line: line + 1 };
}

function combineTemplate(prefixes: string[], values: string[], suffix: string): string[] {
  const combined: string[] = [];
  for (const prefix of prefixes) {
    for (const value of values) {
      combined.push(`${prefix}${value}${suffix}`);
    }
  }
  return combined;
}

function formatUsage(usage: TranslationUsage, detail: string): string {
  return `${usage.file}:${usage.line} [${usage.source}] ${detail}`;
}

function formatIssues(issues: string[]): string {
  return `Detected ${issues.length} i18n integrity issue(s):\n${issues.map((issue) => `- ${issue}`).join('\n')}`;
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

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
