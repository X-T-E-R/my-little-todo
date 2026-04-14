import { create } from 'zustand';

interface UserInfo {
  id: string;
  username: string;
  is_admin: boolean;
  is_enabled?: boolean;
  created_at?: string;
}

export interface SessionBootstrap {
  auth_provider: 'none' | 'embedded' | 'zitadel' | string;
  needs_setup: boolean;
  signup_policy: 'admin_only' | 'open' | 'invite_only' | string;
  sync_mode: 'hosted' | string;
  issuer?: string | null;
  client_id?: string | null;
  audience?: string | null;
  admin_role?: string | null;
  discovery_url?: string | null;
  authorization_endpoint?: string | null;
  token_endpoint?: string | null;
  end_session_endpoint?: string | null;
}

type AuthMode = 'embedded' | 'external' | null;
type AuthRuntime = 'server' | 'local-native';

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  authMode: AuthMode;
  needsSetup: boolean;
  signupPolicy: 'admin_only' | 'open' | 'invite_only' | null;
  loading: boolean;
  bootstrap: SessionBootstrap | null;

  setRuntime: (runtime: AuthRuntime, url: string) => void;
  checkAuthMode: () => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  login: (username?: string, password?: string) => Promise<void>;
  register: (username: string, password: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (oldPassword?: string, newPassword?: string) => Promise<void>;
  checkAuth: () => Promise<boolean>;
  completeAuthCallback: () => Promise<boolean>;
}

const TOKEN_KEY = 'mlt-auth-token';
const USER_KEY = 'mlt-auth-user';
const REFRESH_TOKEN_KEY = 'mlt-auth-refresh-token';
const ID_TOKEN_KEY = 'mlt-auth-id-token';
const EXPIRES_AT_KEY = 'mlt-auth-expires-at';
const TX_KEY = 'mlt-auth-oidc-tx';

let _apiBase = '';
let _authRuntime: AuthRuntime = 'server';

function getApiBase(): string {
  return _apiBase;
}

function apiUrl(path: string): string {
  return `${getApiBase()}${path}`;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function getIdToken(): string | null {
  return localStorage.getItem(ID_TOKEN_KEY);
}

function getExpiresAt(): number {
  const raw = localStorage.getItem(EXPIRES_AT_KEY);
  return raw ? Number(raw) : 0;
}

function setLocalSession(token: string, user: UserInfo) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function setTokens(tokens: {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}) {
  localStorage.setItem(TOKEN_KEY, tokens.access_token);
  if (tokens.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  if (tokens.id_token) localStorage.setItem(ID_TOKEN_KEY, tokens.id_token);
  if (tokens.expires_in) {
    localStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + tokens.expires_in * 1000));
  }
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ID_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TX_KEY);
}

function base64UrlEncode(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomString(length = 64): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return base64UrlEncode(bytes).slice(0, length);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function currentRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

async function fetchBootstrap(): Promise<SessionBootstrap> {
  const response = await fetch(apiUrl('/api/session/bootstrap'), {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Failed to load session bootstrap: HTTP ${response.status}`);
  }
  return (await response.json()) as SessionBootstrap;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init);
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: `Request failed: HTTP ${response.status}` }));
    throw new Error(
      typeof data?.error === 'string' ? data.error : `Request failed: HTTP ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

async function tokenRequest(
  url: string,
  body: URLSearchParams,
): Promise<{
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `OIDC token exchange failed: HTTP ${response.status}`);
  }
  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  };
}

function resolveAuthMode(bootstrap: SessionBootstrap): AuthMode {
  if (bootstrap.auth_provider === 'none') return null;
  return bootstrap.auth_provider === 'zitadel' ? 'external' : 'embedded';
}

function localDesktopUser(): UserInfo {
  return {
    id: 'local-desktop-user',
    username: 'local',
    is_admin: true,
    is_enabled: true,
    created_at: 'local',
  };
}

function localNativeBootstrap(): SessionBootstrap {
  return {
    auth_provider: 'none',
    needs_setup: false,
    signup_policy: 'none',
    sync_mode: 'local',
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: (() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as UserInfo) : null;
    } catch {
      return null;
    }
  })(),
  authMode: null,
  needsSetup: false,
  signupPolicy: null,
  loading: true,
  bootstrap: null,

  setRuntime: (runtime: AuthRuntime, url: string) => {
    _authRuntime = runtime;
    _apiBase = url;
    if (runtime === 'local-native') {
      clearTokens();
    }
  },

  checkAuthMode: async () => {
    if (_authRuntime === 'local-native') {
      set({
        bootstrap: localNativeBootstrap(),
        authMode: null,
        needsSetup: false,
        signupPolicy: null,
        token: null,
        user: localDesktopUser(),
        loading: false,
      });
      return;
    }

    try {
      const bootstrap = await fetchBootstrap();
      const authMode = resolveAuthMode(bootstrap);
      set({
        bootstrap,
        authMode,
        needsSetup: bootstrap.needs_setup,
        signupPolicy:
          bootstrap.signup_policy === 'admin_only' ||
          bootstrap.signup_policy === 'open' ||
          bootstrap.signup_policy === 'invite_only'
            ? bootstrap.signup_policy
            : null,
        user:
          bootstrap.auth_provider === 'none' ? localDesktopUser() : get().token ? get().user : null,
        loading: false,
      });
    } catch {
      set({
        bootstrap: null,
        authMode: 'embedded',
        needsSetup: true,
        signupPolicy: 'invite_only',
        loading: false,
      });
    }
  },

  setup: async (username: string, password: string) => {
    if (_authRuntime === 'local-native') {
      set({
        bootstrap: localNativeBootstrap(),
        authMode: null,
        needsSetup: false,
        signupPolicy: null,
        token: null,
        user: localDesktopUser(),
      });
      return;
    }

    const data = await fetchJson<{ token: string; user: UserInfo }>('/api/session/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    setLocalSession(data.token, data.user);
    set({ token: data.token, user: data.user, needsSetup: false, authMode: 'embedded' });
  },

  login: async (username?: string, password?: string) => {
    if (_authRuntime === 'local-native') {
      set({
        bootstrap: localNativeBootstrap(),
        authMode: null,
        needsSetup: false,
        signupPolicy: null,
        token: null,
        user: localDesktopUser(),
      });
      return;
    }

    const bootstrap = get().bootstrap ?? (await fetchBootstrap());

    if (bootstrap.auth_provider === 'zitadel') {
      if (!bootstrap.authorization_endpoint || !bootstrap.token_endpoint || !bootstrap.client_id) {
        throw new Error('OIDC endpoints are missing from session bootstrap.');
      }

      const state = randomString(32);
      const verifier = randomString(64);
      const challenge = await pkceChallenge(verifier);
      const redirectUri = currentRedirectUri();
      localStorage.setItem(
        TX_KEY,
        JSON.stringify({
          state,
          verifier,
          redirectUri,
          tokenEndpoint: bootstrap.token_endpoint,
          endSessionEndpoint: bootstrap.end_session_endpoint,
        }),
      );

      const params = new URLSearchParams({
        client_id: bootstrap.client_id,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: 'openid profile email offline_access',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
      });
      if (bootstrap.audience) {
        params.set('audience', bootstrap.audience);
      }
      window.location.assign(`${bootstrap.authorization_endpoint}?${params.toString()}`);
      return;
    }

    if (!username || !password) {
      throw new Error('Username and password are required.');
    }

    const data = await fetchJson<{ token: string; user: UserInfo }>('/api/session/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    setLocalSession(data.token, data.user);
    set({ token: data.token, user: data.user, authMode: 'embedded', needsSetup: false });
  },

  register: async (username: string, password: string, inviteCode?: string) => {
    if (_authRuntime === 'local-native') {
      set({
        bootstrap: localNativeBootstrap(),
        authMode: null,
        needsSetup: false,
        signupPolicy: null,
        token: null,
        user: localDesktopUser(),
      });
      return;
    }

    const data = await fetchJson<{ token: string; user: UserInfo }>('/api/session/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, invite_code: inviteCode }),
    });
    setLocalSession(data.token, data.user);
    set({ token: data.token, user: data.user, authMode: 'embedded', needsSetup: false });
  },

  logout: async () => {
    if (_authRuntime === 'local-native') {
      set({
        bootstrap: localNativeBootstrap(),
        authMode: null,
        needsSetup: false,
        signupPolicy: null,
        token: null,
        user: localDesktopUser(),
      });
      return;
    }

    const bootstrap = get().bootstrap;
    const token = getAuthToken();
    const idToken = getIdToken();

    if (token && bootstrap?.auth_provider !== 'zitadel') {
      await fetch(apiUrl('/api/session/logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }

    clearTokens();
    set({ token: null, user: null });

    if (bootstrap?.end_session_endpoint && idToken) {
      const params = new URLSearchParams({
        id_token_hint: idToken,
        post_logout_redirect_uri: currentRedirectUri(),
      });
      window.location.assign(`${bootstrap.end_session_endpoint}?${params.toString()}`);
    }
  },

  changePassword: async () => {
    if (_authRuntime === 'local-native') {
      throw new Error('Local desktop mode does not use account passwords.');
    }

    const bootstrap = get().bootstrap;
    if (bootstrap?.auth_provider === 'zitadel' && bootstrap.issuer) {
      window.open(
        `${bootstrap.issuer.replace(/\/+$/, '')}/ui/console`,
        '_blank',
        'noopener,noreferrer',
      );
      return;
    }
    throw new Error('Embedded mode currently requires an admin to reset passwords.');
  },

  checkAuth: async () => {
    if (_authRuntime === 'local-native') {
      set({
        bootstrap: localNativeBootstrap(),
        token: null,
        user: localDesktopUser(),
      });
      return true;
    }

    const bootstrap = get().bootstrap;
    if (!bootstrap) {
      return false;
    }

    if (bootstrap.auth_provider === 'none') {
      set({ token: null, user: localDesktopUser() });
      return true;
    }

    if (!get().token) return false;

    if (
      bootstrap.auth_provider === 'zitadel' &&
      getExpiresAt() > 0 &&
      Date.now() > getExpiresAt() - 60_000
    ) {
      const refreshToken = getRefreshToken();
      if (refreshToken && bootstrap.token_endpoint && bootstrap.client_id) {
        try {
          const tokens = await tokenRequest(
            bootstrap.token_endpoint,
            new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: refreshToken,
              client_id: bootstrap.client_id,
            }),
          );
          setTokens(tokens);
          set({ token: tokens.access_token });
        } catch {
          clearTokens();
          set({ token: null, user: null });
          return false;
        }
      }
    }

    try {
      const token = getAuthToken();
      const response = await fetch(apiUrl('/api/session/me'), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        clearTokens();
        set({ token: null, user: null });
        return false;
      }
      const user = (await response.json()) as UserInfo;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ token: getAuthToken(), user });
      return true;
    } catch {
      clearTokens();
      set({ token: null, user: null });
      return false;
    }
  },

  completeAuthCallback: async () => {
    if (_authRuntime === 'local-native') return false;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return false;

    const rawTx = localStorage.getItem(TX_KEY);
    if (!rawTx) throw new Error('Missing OIDC transaction state.');
    const tx = JSON.parse(rawTx) as {
      state: string;
      verifier: string;
      redirectUri: string;
      tokenEndpoint: string;
    };
    if (tx.state !== state) {
      throw new Error('OIDC state mismatch.');
    }

    const bootstrap = get().bootstrap ?? (await fetchBootstrap());
    if (bootstrap.auth_provider !== 'zitadel' || !bootstrap.client_id) {
      return false;
    }

    const tokens = await tokenRequest(
      tx.tokenEndpoint || bootstrap.token_endpoint || '',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: tx.redirectUri,
        client_id: bootstrap.client_id,
        code_verifier: tx.verifier,
      }),
    );
    setTokens(tokens);
    localStorage.removeItem(TX_KEY);

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('code');
    cleanUrl.searchParams.delete('state');
    cleanUrl.searchParams.delete('session_state');
    window.history.replaceState({}, document.title, cleanUrl.toString());

    set({
      bootstrap,
      authMode: 'external',
      token: tokens.access_token,
      loading: false,
    });

    return get().checkAuth();
  },
}));
