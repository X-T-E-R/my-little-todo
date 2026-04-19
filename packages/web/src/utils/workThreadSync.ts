import { exists, mkdir, readTextFile, stat, writeTextFile } from '@tauri-apps/plugin-fs';
import {
  ensureWorkThreadRuntime,
  hashWorkThreadMarkdown,
  parseWorkThreadMarkdown,
  serializeWorkThreadToMarkdown,
  type WorkThread,
} from '@my-little-todo/core';
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
  return path.trim().replace(/[\\/]+/g, '/').replace(/\/+$/, '');
}

function dirname(path: string): string {
  const normalized = path.replace(/[\\/]+/g, '/');
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : '';
}

export function slugifyWorkThreadTitle(title: string): string {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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
  const preserveLegacyIntents = patch.intents.length === 0 && /\[\[intent:/i.test(markdown);
  const preserveLegacySparks = patch.sparkContainers.length === 0 && /\[\[spark:/i.test(markdown);
  const preserveLegacyNextActions = patch.nextActions.length === 0 && /\[\[next:/i.test(markdown);
  const preserveLegacyBlocks = patch.waitingFor.length === 0 && /\[\[block:/i.test(markdown);
  const existingIntents = [...thread.intents];
  const existingSparkContainers = [...thread.sparkContainers];
  const existingActions = [...thread.nextActions];
  const existingWaiting = [...thread.waitingFor];
  const existingInterrupts = [...thread.interrupts];
  const intents =
    preserveLegacyIntents
      ? thread.intents
      : patch.intents.map((item) => {
          const matchIndex = existingIntents.findIndex(
            (current) => current.text.trim() === item.text.trim(),
          );
          if (matchIndex < 0) {
            return {
              ...item,
              parentThreadId: thread.id,
            };
          }
          const [matched] = existingIntents.splice(matchIndex, 1);
          return {
            ...matched,
            text: item.text,
            detail: item.detail,
            bodyMarkdown: item.bodyMarkdown,
            collapsed: item.collapsed,
            parentIntentId: item.parentIntentId,
            parentSparkId: item.parentSparkId,
            updatedAt: Date.now(),
          };
        });
  const sparkContainers =
    preserveLegacySparks
      ? thread.sparkContainers
      : patch.sparkContainers.map((item) => {
          const matchIndex = existingSparkContainers.findIndex(
            (current) => current.title.trim() === item.title.trim(),
          );
          if (matchIndex < 0) {
            return {
              ...item,
              parentThreadId: thread.id,
            };
          }
          const [matched] = existingSparkContainers.splice(matchIndex, 1);
          return {
            ...matched,
            title: item.title,
            bodyMarkdown: item.bodyMarkdown,
            collapsed: item.collapsed,
            parentIntentId: item.parentIntentId,
            parentSparkId: item.parentSparkId,
            updatedAt: Date.now(),
          };
        });
  const nextActions =
    preserveLegacyNextActions
      ? thread.nextActions
      : patch.nextActions.map((item) => {
          const matchIndex = existingActions.findIndex(
            (current) => current.text.trim() === item.text.trim(),
          );
          if (matchIndex < 0) {
            return {
              ...item,
              parentThreadId: thread.id,
            };
          }
          const [matched] = existingActions.splice(matchIndex, 1);
          return {
            ...matched,
            done: item.done,
            parentIntentId: item.parentIntentId,
            parentSparkId: item.parentSparkId,
          };
        });
  const waitingFor =
    preserveLegacyBlocks
      ? thread.waitingFor
      : patch.waitingFor.map((item) => {
          const matchIndex = existingWaiting.findIndex(
            (current) =>
              current.kind === item.kind &&
              current.title.trim() === item.title.trim() &&
              (current.detail ?? '').trim() === (item.detail ?? '').trim(),
          );
          if (matchIndex < 0) {
            return {
              ...item,
              parentThreadId: thread.id,
            };
          }
          const [matched] = existingWaiting.splice(matchIndex, 1);
          return {
            ...matched,
            title: item.title,
            detail: item.detail,
            parentIntentId: item.parentIntentId,
            parentSparkId: item.parentSparkId,
          };
        });
  const interrupts =
    preserveLegacyBlocks
      ? thread.interrupts
      : patch.interrupts.map((item) => {
          const matchIndex = existingInterrupts.findIndex(
            (current) =>
              current.source === item.source &&
              current.title.trim() === item.title.trim() &&
              (current.content ?? '').trim() === (item.content ?? '').trim(),
          );
          if (matchIndex < 0) {
            return {
              ...item,
              parentThreadId: thread.id,
            };
          }
          const [matched] = existingInterrupts.splice(matchIndex, 1);
          return {
            ...matched,
            title: item.title,
            content: item.content,
            parentIntentId: item.parentIntentId,
            parentSparkId: item.parentSparkId,
          };
        });
  const next = ensureWorkThreadRuntime({
    ...thread,
    title: patch.frontmatter.title?.trim() || thread.title,
    mission: patch.frontmatter.mission?.trim() || thread.mission,
    status: patch.frontmatter.status ?? thread.status,
    lane: patch.frontmatter.lane ?? thread.lane,
    roleId: patch.frontmatter.roleId?.trim() || thread.roleId,
    docMarkdown: patch.docMarkdown,
    rootMarkdown: patch.rootMarkdown,
    explorationMarkdown: patch.explorationMarkdown,
    intents,
    sparkContainers,
    nextActions,
    waitingFor,
    interrupts,
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
      lastExternalModifiedAt: info.mtime ? info.mtime.getTime() : thread.syncMeta?.lastExternalModifiedAt,
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
