import { create } from 'zustand';
import { getDataStore } from '../storage/dataStore';

/** Lifted focus session so App shell can hide nav when locked. Synced via DataStore KV `focus-session` (multi-device). */
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

/** Max wall-clock length for a single focus session after refresh (avoid stale locks from days ago). */
const MAX_FOCUS_SESSION_MS = 8 * 60 * 60 * 1000;

const KV_KEY = 'focus-session';

function parseSession(s: FocusSessionState): FocusSessionState | null {
  const started =
    s.startedAt instanceof Date ? s.startedAt : new Date(s.startedAt as unknown as string);
  if (Number.isNaN(started.getTime()) || Date.now() - started.getTime() > MAX_FOCUS_SESSION_MS) {
    return null;
  }
  let exitCooldownUntil: Date | undefined;
  if (s.exitCooldownUntil !== undefined) {
    const cd =
      s.exitCooldownUntil instanceof Date
        ? s.exitCooldownUntil
        : new Date(s.exitCooldownUntil as unknown as string);
    exitCooldownUntil = Number.isNaN(cd.getTime()) ? undefined : cd;
  }
  return {
    ...s,
    startedAt: started,
    exitCooldownUntil,
  };
}

export const useFocusSessionStore = create<FocusSessionSlice>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  updateSession: (partial) =>
    set((state) => ({
      session: state.session ? { ...state.session, ...partial } : null,
    })),
}));

/** Load from settings KV (and migrate legacy zustand localStorage once). */
let _hydratePromise: Promise<void> | null = null;

/** Idempotent: loads KV (and migrates legacy localStorage once). */
export function ensureFocusSessionHydrated(): Promise<void> {
  if (!_hydratePromise) {
    _hydratePromise = hydrateFocusSessionFromKV();
  }
  return _hydratePromise;
}

async function hydrateFocusSessionFromKV(): Promise<void> {
  const ds = getDataStore();
  const fromKv = await ds.getSetting(KV_KEY);
  if (fromKv) {
    try {
      const raw = JSON.parse(fromKv) as FocusSessionState;
      const session = parseSession(raw);
      useFocusSessionStore.setState({ session });
    } catch {
      /* ignore */
    }
    return;
  }

  try {
    const legacy = localStorage.getItem('mlt-focus-session');
    if (!legacy) return;
    const parsed = JSON.parse(legacy) as { state?: { session?: FocusSessionState } };
    const rawSession = parsed.state?.session;
    if (!rawSession) return;
    const session = parseSession(rawSession);
    if (session) {
      useFocusSessionStore.setState({ session });
      await ds.putSetting(KV_KEY, JSON.stringify(session));
    }
    localStorage.removeItem('mlt-focus-session');
  } catch {
    /* ignore */
  }
}

let _lastSerialized: string | null = null;

if (typeof window !== 'undefined') {
  useFocusSessionStore.subscribe((state) => {
    const next = state.session ? JSON.stringify(state.session) : 'null';
    if (next === _lastSerialized) return;
    _lastSerialized = next;
    const ds = getDataStore();
    if (state.session) {
      void ds.putSetting(KV_KEY, JSON.stringify(state.session));
    } else {
      void ds.deleteSetting(KV_KEY);
    }
  });
}
