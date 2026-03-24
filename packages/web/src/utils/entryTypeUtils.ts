import type { StreamEntryType } from '@my-little-todo/core';
import { CheckSquare2, FileText, Sparkles } from 'lucide-react';

export interface EntryTypeMeta {
  icon: typeof Sparkles;
  labelKey: string;
  dotColor: string;
  borderColor: string;
}

export const ENTRY_TYPE_META: Record<StreamEntryType, EntryTypeMeta> = {
  spark: {
    icon: Sparkles,
    labelKey: 'Inspiration',
    dotColor: 'var(--color-warning, #f59e0b)',
    borderColor: 'color-mix(in srgb, var(--color-warning, #f59e0b) 30%, transparent)',
  },
  task: {
    icon: CheckSquare2,
    labelKey: 'Task',
    dotColor: 'var(--color-accent)',
    borderColor: 'color-mix(in srgb, var(--color-accent) 40%, transparent)',
  },
  log: {
    icon: FileText,
    labelKey: 'Log',
    dotColor: 'var(--color-text-tertiary)',
    borderColor: 'var(--color-border)',
  },
};

export const ENTRY_TYPE_KEYS: StreamEntryType[] = ['spark', 'task', 'log'];
