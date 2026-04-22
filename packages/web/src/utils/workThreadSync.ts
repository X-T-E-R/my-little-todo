import {
  type WorkThread,
  ensureWorkThreadRuntime,
  hashWorkThreadMarkdown,
  parseWorkThreadMarkdown,
  serializeWorkThreadToMarkdown,
} from '@my-little-todo/core';
import { exists, mkdir, readTextFile, stat, writeTextFile } from '@tauri-apps/plugin-fs';
import { isTauriEnv } from './platform';

export const WORK_THREAD_MARKDOWN_SYNC_ENABLED_KEY = 'work-thread:markdown-sync-enabled';
export const WORK_THREAD_MARKDOWN_SYNC_ROOT_KEY = 'work-thread:markdown-sync-root';
export const WORK_THREAD_MARKDOWN_AUTO_IMPORT_KEY = 'work-thread:markdown-auto-import';

export interface WorkThreadSyncPrefs {
  enabled: boolean;
  root: string;
  autoImport: boolean;
}

export interface WorkThreadExternalSnapshot {
  filePath: string;
  markdown: string;
  modifiedAt: number | null;
  hash: string;
}

export type WorkThreadExternalCheck =
  | { kind: 'unsupported' | 'disabled' | 'missing' | 'unchanged' }
  | { kind: 'imported'; thread: WorkThread; snapshot: WorkThreadExternalSnapshot }
  | { kind: 'external-change'; thread: WorkThread; snapshot: WorkThreadExternalSnapshot };

function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/[\\/]+/g, '/')
    .replace(/\/+$/, '');
}

function buildImportedPause(
  reason: string | undefined,
  thenText?: string,
): NonNullable<WorkThread['pause']> | undefined {
  const normalizedReason = reason?.trim();
  if (!normalizedReason) return undefined;
  const pause: NonNullable<WorkThread['pause']> = {
    reason: normalizedReason,
    updatedAt: Date.now(),
  };
  const normalizedThen = thenText?.trim();
  if (normalizedThen) {
    // biome-ignore lint/suspicious/noThenProperty: `pause.then` is a persisted domain field.
    pause.then = normalizedThen;
  }
  return pause;
}

function dirname(path: string): string {
  const normalized = path.replace(/[\\/]+/g, '/');
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : '';
}

export function slugifyWorkThreadTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'thread';
}

export function buildWorkThreadMarkdownFilename(thread: Pick<WorkThread, 'id' | 'title'>): string {
  return `${slugifyWorkThreadTitle(thread.title)}--${thread.id}.md`;
}

export function resolveWorkThreadSyncFilePath(
  thread: WorkThread,
  prefs: Pick<WorkThreadSyncPrefs, 'root'>,
): string {
  const explicit = thread.syncMeta?.filePath?.trim();
  if (explicit) return explicit;
  const root = normalizePath(prefs.root);
  if (!root) return '';
  return `${root}/${buildWorkThreadMarkdownFilename(thread)}`;
}

export function canUseWorkThreadMarkdownSync(
  prefs: Pick<WorkThreadSyncPrefs, 'enabled' | 'root'>,
): boolean {
  return isTauriEnv() && prefs.enabled && Boolean(normalizePath(prefs.root));
}

export function applyMarkdownPatchToThread(
  thread: WorkThread,
  markdown: string,
  modifiedAt?: number | null,
): WorkThread {
  const patch = parseWorkThreadMarkdown(markdown);
  const next = ensureWorkThreadRuntime({
    ...thread,
    title: patch.frontmatter.title?.trim() || thread.title,
    bodyMarkdown: patch.bodyMarkdown,
    resume: patch.frontmatter.resume?.trim() || undefined,
    pause: buildImportedPause(patch.frontmatter.pauseReason, patch.frontmatter.pauseThen),
    blocks: patch.blocks,
    status: patch.frontmatter.status ?? thread.status,
    roleId: patch.frontmatter.roleId?.trim() || thread.roleId,
    docMarkdown: patch.docMarkdown,
    rootMarkdown: patch.bodyMarkdown,
    explorationMarkdown: '',
    intents: thread.intents,
    sparkContainers: thread.sparkContainers,
    nextActions: thread.nextActions,
    waitingFor: thread.waitingFor,
    interrupts: thread.interrupts,
    updatedAt: Date.now(),
    syncMeta: {
      ...(thread.syncMeta ?? { mode: 'internal' }),
      mode: 'hybrid',
      lastImportedAt: Date.now(),
      lastExternalModifiedAt: modifiedAt ?? thread.syncMeta?.lastExternalModifiedAt,
      lastExportedHash: hashWorkThreadMarkdown(normalizeThreadMarkdown(markdown)),
    },
  });
  return next;
}

export function normalizeThreadMarkdown(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n').trimEnd();
}

export async function readWorkThreadExternalSnapshot(
  filePath: string,
): Promise<WorkThreadExternalSnapshot | null> {
  if (!isTauriEnv() || !filePath.trim()) return null;
  if (!(await exists(filePath))) return null;
  const markdown = normalizeThreadMarkdown(await readTextFile(filePath));
  const info = await stat(filePath);
  return {
    filePath,
    markdown,
    modifiedAt: info.mtime ? info.mtime.getTime() : null,
    hash: hashWorkThreadMarkdown(markdown),
  };
}

export async function exportWorkThreadToMarkdownFile(
  thread: WorkThread,
  prefs: WorkThreadSyncPrefs,
): Promise<WorkThread> {
  if (!canUseWorkThreadMarkdownSync(prefs)) return ensureWorkThreadRuntime(thread);
  const filePath = resolveWorkThreadSyncFilePath(thread, prefs);
  if (!filePath) return ensureWorkThreadRuntime(thread);
  const parent = dirname(filePath);
  if (parent) {
    await mkdir(parent, { recursive: true });
  }
  const markdown = normalizeThreadMarkdown(serializeWorkThreadToMarkdown(thread));
  await writeTextFile(filePath, markdown);
  const info = await stat(filePath);
  return ensureWorkThreadRuntime({
    ...thread,
    syncMeta: {
      ...(thread.syncMeta ?? { mode: 'internal' }),
      mode: 'hybrid',
      filePath,
      lastExportedHash: hashWorkThreadMarkdown(markdown),
      lastExternalModifiedAt: info.mtime
        ? info.mtime.getTime()
        : thread.syncMeta?.lastExternalModifiedAt,
    },
  });
}

export async function checkWorkThreadExternalChanges(
  thread: WorkThread,
  prefs: WorkThreadSyncPrefs,
  hasDirtyEditor: boolean,
): Promise<WorkThreadExternalCheck> {
  if (!canUseWorkThreadMarkdownSync(prefs)) {
    return { kind: prefs.enabled ? 'unsupported' : 'disabled' };
  }
  const filePath = resolveWorkThreadSyncFilePath(thread, prefs);
  if (!filePath) return { kind: 'disabled' };
  const snapshot = await readWorkThreadExternalSnapshot(filePath);
  if (!snapshot) return { kind: 'missing' };
  const lastKnownHash = thread.syncMeta?.lastExportedHash;
  const lastKnownModifiedAt = thread.syncMeta?.lastExternalModifiedAt;
  const unchanged =
    snapshot.hash === lastKnownHash ||
    (snapshot.modifiedAt != null &&
      lastKnownModifiedAt != null &&
      snapshot.modifiedAt === lastKnownModifiedAt);
  if (unchanged) return { kind: 'unchanged' };
  const importedThread = applyMarkdownPatchToThread(thread, snapshot.markdown, snapshot.modifiedAt);
  if (!prefs.autoImport || hasDirtyEditor) {
    return { kind: 'external-change', thread: importedThread, snapshot };
  }
  return { kind: 'imported', thread: importedThread, snapshot };
}
