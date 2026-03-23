import { create } from 'zustand';
import { loadShortcuts, saveShortcuts } from '../storage/shortcutRepo';
import type { ShortcutBinding } from '../utils/shortcuts';
import { DEFAULT_SHORTCUTS } from '../utils/shortcuts';

interface ShortcutState {
  shortcuts: ShortcutBinding[];
  loading: boolean;

  load: () => Promise<void>;
  updateShortcut: (id: string, keys: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  getKeys: (action: string) => string | undefined;
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  shortcuts: DEFAULT_SHORTCUTS,
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const shortcuts = await loadShortcuts();
      set({ shortcuts, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  updateShortcut: async (id: string, keys: string) => {
    const updated = get().shortcuts.map((s) => (s.id === id ? { ...s, keys } : s));
    await saveShortcuts(updated);
    set({ shortcuts: updated });
  },

  resetToDefaults: async () => {
    const defaults = [...DEFAULT_SHORTCUTS];
    await saveShortcuts(defaults);
    set({ shortcuts: defaults });
  },

  getKeys: (action: string) => {
    return get().shortcuts.find((s) => s.action === action)?.keys;
  },
}));
