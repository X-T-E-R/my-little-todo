import { create } from 'zustand';

/** When set, Now view should focus this task (from "Do it now" elsewhere). Cleared after applied. */
interface NowOverrideSlice {
  overrideTaskId: string | null;
  setOverrideTaskId: (id: string | null) => void;
  /** Set override and request app shell to switch to Now tab (custom event). */
  requestDoItNow: (taskId: string) => void;
}

export const useNowOverrideStore = create<NowOverrideSlice>((set) => ({
  overrideTaskId: null,
  setOverrideTaskId: (id) => set({ overrideTaskId: id }),
  requestDoItNow: (taskId) => {
    set({ overrideTaskId: taskId });
    window.dispatchEvent(new CustomEvent('mlt-navigate', { detail: { view: 'now' as const } }));
  },
}));
