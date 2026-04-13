import type { WindowContext } from '@my-little-todo/core';
import { create } from 'zustand';
import { getDataStore } from '../storage/dataStore';
import { type ForegroundPayload, matchWindowContexts } from '../utils/windowContextMatch';

interface WindowContextState {
  foreground: ForegroundPayload | null;
  contexts: WindowContext[];
  matched: WindowContext | null;
  loading: boolean;

  loadContexts: () => Promise<void>;
  setForeground: (fg: ForegroundPayload | null) => void;
  putContext: (ctx: WindowContext) => Promise<void>;
  deleteContext: (id: string) => Promise<void>;
}

function recomputeMatch(
  foreground: ForegroundPayload | null,
  contexts: WindowContext[],
): WindowContext | null {
  if (!foreground) return null;
  return matchWindowContexts(contexts, foreground);
}

export const useWindowContextStore = create<WindowContextState>((set, get) => ({
  foreground: null,
  contexts: [],
  matched: null,
  loading: false,

  loadContexts: async () => {
    set({ loading: true });
    try {
      const contexts = await getDataStore().getAllWindowContexts();
      const { foreground } = get();
      set({
        contexts,
        matched: recomputeMatch(foreground, contexts),
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  setForeground: (fg) => {
    const { contexts } = get();
    set({
      foreground: fg,
      matched: recomputeMatch(fg, contexts),
    });
  },

  putContext: async (ctx) => {
    await getDataStore().putWindowContext(ctx);
    await get().loadContexts();
  },

  deleteContext: async (id) => {
    await getDataStore().deleteWindowContext(id);
    await get().loadContexts();
  },
}));
