import { useEffect } from 'react';
import { useShortcutStore } from '../stores/shortcutStore';
import type { ShortcutScope } from './shortcuts';
import { matchesShortcut } from './shortcuts';

/**
 * Register keyboard shortcut handlers for a given scope.
 * @param scope - 'global' or 'editor'
 * @param handlers - Map of action IDs to handler functions.
 */
export function useShortcuts(
  scope: ShortcutScope,
  handlers: Record<string, (e: KeyboardEvent) => void>,
): void {
  const shortcuts = useShortcutStore((s) => s.shortcuts);

  useEffect(() => {
    const scopedBindings = shortcuts.filter((s) => s.scope === scope);

    const listener = (e: KeyboardEvent) => {
      for (const binding of scopedBindings) {
        if (matchesShortcut(e, binding.keys)) {
          const handler = handlers[binding.action];
          if (handler) {
            e.preventDefault();
            e.stopPropagation();
            handler(e);
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [shortcuts, scope, handlers]);
}
