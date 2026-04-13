import type { ComponentType } from 'react';

export type SettingsEntrySource = 'builtin' | 'plugin';

export interface SettingsEntry {
  id: string;
  source: SettingsEntrySource;
  component: ComponentType<Record<string, never>>;
}

const settingsEntries = new Map<string, SettingsEntry>();
const listeners = new Set<() => void>();

function getKey(source: SettingsEntrySource, id: string): string {
  return `${source}:${id}`;
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeSettingsRegistry(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function registerSettingsEntry(entry: SettingsEntry): void {
  settingsEntries.set(getKey(entry.source, entry.id), entry);
  emit();
}

export function unregisterSettingsEntry(source: SettingsEntrySource, id: string): void {
  settingsEntries.delete(getKey(source, id));
  emit();
}

export function getSettingsEntry(
  source: SettingsEntrySource,
  id: string,
): SettingsEntry | undefined {
  return settingsEntries.get(getKey(source, id));
}

export function getSettingsEntries(): SettingsEntry[] {
  return Array.from(settingsEntries.values());
}
