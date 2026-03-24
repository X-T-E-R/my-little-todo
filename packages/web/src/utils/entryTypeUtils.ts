import type { StreamEntryType } from '@my-little-todo/core';
import { BookOpen, CheckSquare2, FileText, Sparkles, StickyNote } from 'lucide-react';

export interface EntryTypeMeta {
  icon: typeof Sparkles;
  labelKey: string;
  dotColor: string;
  dotRadius: number | string;
  borderColor: string;
}

export const ENTRY_TYPE_META: Record<StreamEntryType, EntryTypeMeta> = {
  spark: {
    icon: Sparkles,
    labelKey: 'Inspiration',
    dotColor: 'var(--color-border)',
    dotRadius: '50%',
    borderColor: 'var(--color-border)',
  },
  task: {
    icon: CheckSquare2,
    labelKey: 'Task',
    dotColor: 'var(--color-accent)',
    dotRadius: 2,
    borderColor: 'color-mix(in srgb, var(--color-accent) 40%, transparent)',
  },
  note: {
    icon: StickyNote,
    labelKey: 'Note',
    dotColor: 'var(--color-info, #3b82f6)',
    dotRadius: '50%',
    borderColor: 'color-mix(in srgb, var(--color-info, #3b82f6) 30%, transparent)',
  },
  journal: {
    icon: BookOpen,
    labelKey: 'Journal',
    dotColor: 'var(--color-warning, #f59e0b)',
    dotRadius: '50%',
    borderColor: 'color-mix(in srgb, var(--color-warning, #f59e0b) 30%, transparent)',
  },
  log: {
    icon: FileText,
    labelKey: 'Log',
    dotColor: 'var(--color-text-tertiary)',
    dotRadius: 2,
    borderColor: 'var(--color-border)',
  },
};

export const ENTRY_TYPE_KEYS: StreamEntryType[] = ['spark', 'task', 'note', 'journal', 'log'];
