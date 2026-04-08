import type { KanbanColumn } from '@my-little-todo/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { KanbanGroupMode } from '../utils/kanbanUtils';

type CollapsedMap = Partial<Record<KanbanColumn, boolean>>;

export const useKanbanUiStore = create(
  persist<{
    collapsed: CollapsedMap;
    toggleColumn: (id: KanbanColumn) => void;
    /** Keyboard navigation focus (J/K/H/L). */
    kanbanFocusTaskId: string | null;
    setKanbanFocusTaskId: (id: string | null) => void;
    /** How columns are derived: workflow status vs priority bands vs first role. */
    groupMode: KanbanGroupMode;
    setGroupMode: (mode: KanbanGroupMode) => void;
  }>(
    (set) => ({
      collapsed: {},
      toggleColumn: (id) =>
        set((s) => ({
          collapsed: { ...s.collapsed, [id]: !s.collapsed[id] },
        })),
      kanbanFocusTaskId: null,
      setKanbanFocusTaskId: (id) => set({ kanbanFocusTaskId: id }),
      groupMode: 'status',
      setGroupMode: (mode) => set({ groupMode: mode }),
    }),
    { name: 'mlt-kanban-ui' },
  ),
);
