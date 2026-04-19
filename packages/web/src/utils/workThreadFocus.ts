import type { WorkThread } from '@my-little-todo/core';
import {
  formatWorkThreadContainerPath,
  parseWorkThreadContainerPath,
  type WorkThreadContainerPathSegment,
} from './workThreadDocSyntax';

export type WorkThreadWorkspaceFocus =
  | { kind: 'root' }
  | { kind: 'exploration'; containerPath?: string; title?: string }
  | { kind: 'intent'; id?: string; containerPath?: string; title?: string }
  | { kind: 'spark'; id?: string; containerPath?: string; title?: string };

function appendMarkdown(base: string, addition: string): string {
  const normalizedBase = base.replace(/\r\n/g, '\n').trim();
  const normalizedAddition = addition.replace(/\r\n/g, '\n').trim();
  if (!normalizedAddition) return normalizedBase;
  if (!normalizedBase) return normalizedAddition;
  return `${normalizedBase}\n\n${normalizedAddition}`;
}

export function getWorkThreadFocusParent(
  focus: WorkThreadWorkspaceFocus,
): { parentIntentId?: string; parentSparkId?: string } {
  if (focus.kind === 'intent' && focus.id) {
    return { parentIntentId: focus.id };
  }
  if (focus.kind === 'spark' && focus.id) {
    return { parentSparkId: focus.id };
  }
  return {};
}

function findSiblingIntents(
  thread: WorkThread,
  parent: { parentIntentId?: string; parentSparkId?: string },
) {
  return thread.intents.filter(
    (item) =>
      item.parentIntentId === parent.parentIntentId &&
      item.parentSparkId === parent.parentSparkId,
  );
}

function findSiblingSparks(
  thread: WorkThread,
  parent: { parentIntentId?: string; parentSparkId?: string },
) {
  return thread.sparkContainers.filter(
    (item) =>
      item.parentIntentId === parent.parentIntentId &&
      item.parentSparkId === parent.parentSparkId,
  );
}

export function resolveWorkThreadFocusByContainerPath(
  thread: WorkThread | null | undefined,
  focus: WorkThreadWorkspaceFocus,
): WorkThreadWorkspaceFocus {
  if (!thread) return { kind: 'root' };
  if (focus.kind === 'root') return focus;
  if (focus.kind === 'exploration') {
    return {
      kind: 'exploration',
      containerPath: focus.containerPath ?? (thread.explorationMarkdown ? 'explore:0' : undefined),
      title: focus.title ?? '探索区',
    };
  }

  const segments = parseWorkThreadContainerPath(focus.containerPath);
  if (segments.length === 0) {
    return focus;
  }

  let parentIntentId: string | undefined;
  let parentSparkId: string | undefined;
  let resolved: WorkThreadWorkspaceFocus = { kind: 'root' };

  for (const segment of segments) {
    if (segment.kind === 'intent') {
      const intent = findSiblingIntents(thread, { parentIntentId, parentSparkId })[segment.index];
      if (!intent) return focus;
      parentIntentId = intent.id;
      parentSparkId = undefined;
      resolved = {
        kind: 'intent',
        id: intent.id,
        title: intent.text,
        containerPath: focus.containerPath,
      };
      continue;
    }
    if (segment.kind === 'spark') {
      const spark = findSiblingSparks(thread, { parentIntentId, parentSparkId })[segment.index];
      if (!spark) return focus;
      parentIntentId = spark.parentIntentId;
      parentSparkId = spark.id;
      resolved = {
        kind: 'spark',
        id: spark.id,
        title: spark.title,
        containerPath: focus.containerPath,
      };
      continue;
    }
    resolved = {
      kind: 'exploration',
      containerPath: focus.containerPath,
      title: focus.title ?? '探索区',
    };
  }

  return resolved;
}

function findContainerPathInThread(
  thread: WorkThread,
  target: { kind: 'intent' | 'spark'; id: string },
): string | undefined {
  const visit = (
    parent: { parentIntentId?: string; parentSparkId?: string },
    path: WorkThreadContainerPathSegment[],
  ): string | undefined => {
    const intents = findSiblingIntents(thread, parent);
    for (let index = 0; index < intents.length; index += 1) {
      const intent = intents[index];
      const nextPath = [...path, { kind: 'intent' as const, index }];
      if (target.kind === 'intent' && intent.id === target.id) {
        return formatWorkThreadContainerPath(nextPath);
      }
      const nested = visit({ parentIntentId: intent.id, parentSparkId: undefined }, nextPath);
      if (nested) return nested;
    }

    const sparks = findSiblingSparks(thread, parent);
    for (let index = 0; index < sparks.length; index += 1) {
      const spark = sparks[index];
      const nextPath = [...path, { kind: 'spark' as const, index }];
      if (target.kind === 'spark' && spark.id === target.id) {
        return formatWorkThreadContainerPath(nextPath);
      }
      const nested = visit(
        { parentIntentId: spark.parentIntentId, parentSparkId: spark.id },
        nextPath,
      );
      if (nested) return nested;
    }

    return undefined;
  };

  return visit({}, []);
}

export function getWorkThreadFocusContainerPath(
  thread: WorkThread | null | undefined,
  focus: WorkThreadWorkspaceFocus,
): string | undefined {
  if (!thread) return focus.kind === 'root' ? undefined : focus.containerPath;
  if (focus.kind === 'exploration') {
    return focus.containerPath ?? (thread.explorationMarkdown ? 'explore:0' : undefined);
  }
  if (focus.kind === 'intent' && focus.id) {
    return focus.containerPath ?? findContainerPathInThread(thread, { kind: 'intent', id: focus.id });
  }
  if (focus.kind === 'spark' && focus.id) {
    return focus.containerPath ?? findContainerPathInThread(thread, { kind: 'spark', id: focus.id });
  }
  return 'containerPath' in focus ? focus.containerPath : undefined;
}

export function getWorkThreadFocusLabel(
  thread: WorkThread | null | undefined,
  focus: WorkThreadWorkspaceFocus,
): string {
  if (!thread) {
    return focus.kind === 'exploration' ? '探索区' : '线程正文';
  }
  if (focus.kind === 'exploration') {
    return '探索区';
  }
  if (focus.kind === 'intent') {
    const intent = thread.intents.find((item) => item.id === focus.id);
    const label = intent?.text ?? focus.title;
    return label ? `Intent · ${label}` : '线程正文';
  }
  if (focus.kind === 'spark') {
    const spark = thread.sparkContainers.find((item) => item.id === focus.id);
    const label = spark?.title ?? focus.title;
    return label ? `Spark · ${label}` : '线程正文';
  }
  return '线程正文';
}

export function normalizeWorkThreadFocus(
  thread: WorkThread | null | undefined,
  focus: WorkThreadWorkspaceFocus,
): WorkThreadWorkspaceFocus {
  if (!thread) return { kind: 'root' };
  if (focus.kind === 'intent') {
    if (focus.id && thread.intents.some((item) => item.id === focus.id)) {
      return {
        ...focus,
        title:
          focus.title ??
          thread.intents.find((item) => item.id === focus.id)?.text,
        containerPath: getWorkThreadFocusContainerPath(thread, focus),
      };
    }
    if (focus.containerPath) {
      return resolveWorkThreadFocusByContainerPath(thread, focus);
    }
    return { kind: 'root' };
  }
  if (focus.kind === 'spark') {
    if (focus.id && thread.sparkContainers.some((item) => item.id === focus.id)) {
      return {
        ...focus,
        title:
          focus.title ??
          thread.sparkContainers.find((item) => item.id === focus.id)?.title,
        containerPath: getWorkThreadFocusContainerPath(thread, focus),
      };
    }
    if (focus.containerPath) {
      return resolveWorkThreadFocusByContainerPath(thread, focus);
    }
    return { kind: 'root' };
  }
  if (focus.kind === 'exploration') {
    return {
      kind: 'exploration',
      containerPath: focus.containerPath ?? (thread.explorationMarkdown ? 'explore:0' : undefined),
      title: focus.title ?? '探索区',
    };
  }
  return focus;
}

export function appendMarkdownToFocusedThread(
  thread: WorkThread,
  focus: WorkThreadWorkspaceFocus,
  addition: string,
): WorkThread {
  const now = Date.now();
  const normalized = addition.replace(/\r\n/g, '\n').trim();
  if (!normalized) return thread;

  if (focus.kind === 'exploration') {
    return {
      ...thread,
      explorationMarkdown: appendMarkdown(thread.explorationMarkdown, normalized),
      updatedAt: now,
    };
  }

  if (focus.kind === 'intent') {
    const exists = thread.intents.some((item) => item.id === focus.id);
    if (exists) {
      return {
        ...thread,
        intents: thread.intents.map((item) => {
          if (item.id !== focus.id) return item;
          const bodyMarkdown = appendMarkdown(item.bodyMarkdown ?? item.detail ?? '', normalized);
          return {
            ...item,
            bodyMarkdown,
            detail: bodyMarkdown || undefined,
            updatedAt: now,
          };
        }),
        updatedAt: now,
      };
    }
  }

  if (focus.kind === 'spark') {
    const exists = thread.sparkContainers.some((item) => item.id === focus.id);
    if (exists) {
      return {
        ...thread,
        sparkContainers: thread.sparkContainers.map((item) =>
          item.id === focus.id
            ? {
                ...item,
                bodyMarkdown: appendMarkdown(item.bodyMarkdown, normalized),
                updatedAt: now,
              }
            : item,
        ),
        updatedAt: now,
      };
    }
  }

  return {
    ...thread,
    rootMarkdown: appendMarkdown(thread.rootMarkdown, normalized),
    updatedAt: now,
  };
}
