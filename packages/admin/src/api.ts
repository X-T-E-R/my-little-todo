const TOKEN_KEY = 'mlt-admin-token';

let baseUrl = window.location.origin;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getToken();
  const h: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function getAuthMode(): Promise<{ mode: string; needs_setup: boolean }> {
  const res = await fetch(`${baseUrl}/api/auth/mode`);
  if (!res.ok) return { mode: 'none', needs_setup: false };
  return res.json();
}

export async function register(username: string, password: string) {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Registration failed' }));
    throw new Error(data.error);
  }
  return res.json();
}

export async function login(username: string, password: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(data.error);
  }
  return res.json();
}

export async function getMe() {
  const res = await fetch(`${baseUrl}/api/auth/me`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
}

export async function getStats() {
  const res = await fetch(`${baseUrl}/api/admin/stats`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function getUsers() {
  const res = await fetch(`${baseUrl}/api/admin/users`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function deleteUser(id: string) {
  const res = await fetch(`${baseUrl}/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Delete failed' }));
    throw new Error(data.error);
  }
  return res.json();
}

export async function resetPassword(id: string, newPassword: string) {
  const res = await fetch(`${baseUrl}/api/admin/users/${id}/password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Reset failed' }));
    throw new Error(data.error);
  }
  return res.json();
}
