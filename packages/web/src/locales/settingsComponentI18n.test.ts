import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcRoot = path.resolve(__dirname, '..');
const builtinRegistryFile = path.resolve(srcRoot, 'settings', 'registerBuiltinSettings.tsx');
const TARGET_JSX_ATTRS = new Set(['label', 'title', 'placeholder', 'aria-label']);
const TARGET_OBJECT_KEYS = new Set(['label']);
const ALLOWED_RAW_COPY = new Set([
  'Cursor',
  'Claude Desktop',
  'VS Code (Copilot)',
  'Windsurf',
  'Generic',
  'WebDAV',
  'MLT Server',
  'uploads',
]);

describe('settings component i18n', () => {
  it('keeps registered builtin settings components free of raw English UI copy', () => {
    const files = getBuiltinSettingsComponentFiles();
    const issues = files.flatMap((filePath) => collectRawCopyIssues(filePath));

    if (issues.length > 0) {
      throw new Error(
        `Detected ${issues.length} untranslated settings literal(s):\n${issues
          .map((issue) => `- ${issue}`)
          .join('\n')}`,
      );
    }
  });
});

function getBuiltinSettingsComponentFiles(): string[] {
  const sourceText = readFileSync(builtinRegistryFile, 'utf8');
  const sourceFile = ts.createSourceFile(
    builtinRegistryFile,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  return sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text)
    .filter((specifier) => specifier.startsWith('../components/'))
    .map((specifier) => path.resolve(path.dirname(builtinRegistryFile), `${specifier}.tsx`));
}

function collectRawCopyIssues(filePath: string): string[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const issues: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const text = normalize(node.getFullText(sourceFile));
      if (isSuspiciousUiCopy(text) && !isTranslatedContext(node)) {
        issues.push(formatIssue(sourceFile, node, text));
      }
    }

    const attrName = ts.isJsxAttribute(node) ? getJsxAttributeName(node.name) : undefined;
    if (ts.isJsxAttribute(node) && attrName && TARGET_JSX_ATTRS.has(attrName)) {
      const text = getStringLiteralFromInitializer(node.initializer);
      if (text && isSuspiciousUiCopy(text) && !isTranslatedContext(node)) {
        issues.push(formatIssue(sourceFile, node, text));
      }
    }

    if (ts.isPropertyAssignment(node) && TARGET_OBJECT_KEYS.has(getPropertyName(node.name) ?? '')) {
      const text = getLiteralText(node.initializer);
      if (text && isSuspiciousUiCopy(text) && !isTranslatedContext(node)) {
        issues.push(formatIssue(sourceFile, node, text));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return issues;
}

function getStringLiteralFromInitializer(
  initializer: ts.JsxAttributeValue | undefined,
): string | undefined {
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    return getLiteralText(initializer.expression);
  }
  return undefined;
}

function getJsxAttributeName(name: ts.JsxAttributeName): string | undefined {
  return ts.isIdentifier(name) ? name.text : undefined;
}

function getLiteralText(node: ts.Node): string | undefined {
  const target = unwrapExpression(node);
  if (ts.isStringLiteral(target) || ts.isNoSubstitutionTemplateLiteral(target)) {
    return target.text;
  }
  return undefined;
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

function isTranslatedContext(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (
      ts.isCallExpression(current) &&
      ((ts.isIdentifier(current.expression) && ['t', 'ts'].includes(current.expression.text)) ||
        (ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === 't'))
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isSuspiciousUiCopy(text: string): boolean {
  if (!text) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (ALLOWED_RAW_COPY.has(text)) return false;
  if (/^https?:\/\//.test(text)) return false;
  if (/^[.~]?[/\\]/.test(text)) return false;
  if (/^[a-z0-9_-]+=[a-z0-9_-]+$/i.test(text)) return false;
  if (/^[a-z][a-z0-9_-]*$/.test(text)) return false;
  if (/\.json$/i.test(text)) return false;
  return true;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function getPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function formatIssue(sourceFile: ts.SourceFile, node: ts.Node, text: string): string {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${path.relative(srcRoot, sourceFile.fileName)}:${line + 1} raw "${text}"`;
}
