import { create } from 'zustand';

interface UserInfo {
  id: string;
  username: string;
  is_admin: boolean;
}

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  authMode: 'none' | 'single' | 'multi' | null;
  needsSetup: boolean;
  loading: boolean;

  setApiBase: (url: string) => void;
  checkAuthMode: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

const TOKEN_KEY = 'mlt-auth-token';
const USER_KEY = 'mlt-auth-user';

let _apiBase = '';

function getApiBase(): string {
  return _apiBase;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: (() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })(),
  authMode: null,
  needsSetup: false,
  loading: true,

  setApiBase: (url: string) => {
    _apiBase = url;
  },

  checkAuthMode: async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/mode`);
      if (!res.ok) {
        set({ authMode: 'none', needsSetup: false, loading: false });
        return;
      }
      const data = await res.json();
      set({
        authMode: data.mode,
        needsSetup: data.needs_setup,
        loading: false,
      });
    } catch {
      set({ authMode: 'none', needsSetup: false, loading: false });
    }
  },

  login: async (username: string, password: string) => {
    const res = await fetch(`${getApiBase()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(data.error || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    set({ token: data.token, user: data.user });
  },

  register: async (username: string, password: string) => {
    const res = await fetch(`${getApiBase()}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Registration failed' }));
      throw new Error(data.error || 'Registration failed');
    }
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    set({ token: data.token, user: data.user, needsSetup: false });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null });
  },

  checkAuth: async () => {
    const { authMode, token } = get();
    if (authMode === 'none') return true;
    if (!token) return false;

    try {
      const res = await fetch(`${getApiBase()}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        get().logout();
        return false;
      }
      const user = await res.json();
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ user });
      return true;
    } catch {
      return false;
    }
  },
}));
