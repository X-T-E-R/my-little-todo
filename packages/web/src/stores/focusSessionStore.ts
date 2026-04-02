import { create } from 'zustand';

/** Lifted focus session so App shell can hide nav when locked. */
export interface FocusSessionState {
  taskId: string;
  startedAt: Date;
  notes: string;
  locked: boolean;
  /** When set, user must wait until this time to confirm exit from locked focus. */
  exitCooldownUntil?: Date;
  pendingExitReason?: string;
}

interface FocusSessionSlice {
  session: FocusSessionState | null;
  setSession: (s: FocusSessionState | null) => void;
  updateSession: (partial: Partial<FocusSessionState>) => void;
}

export const useFocusSessionStore = create<FocusSessionSlice>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  updateSession: (partial) =>
    set((state) => ({
      session: state.session ? { ...state.session, ...partial } : null,
    })),
}));
