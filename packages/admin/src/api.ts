const ADMIN_TOKEN_KEY = 'mlt-admin-token';
const SHARED_TOKEN_KEY = 'mlt-auth-token';

const baseUrl = window.location.origin;

export function getToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(SHARED_TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: fallback }));
    throw new Error(typeof data?.error === 'string' ? data.error : fallback);
  }
  return (await res.json()) as T;
}

export async function getMe() {
  const res = await fetch(`${baseUrl}/api/session/me`, { headers: authHeaders() });
  return parseJson(res, 'Unauthorized');
}

export async function getStats() {
  const res = await fetch(`${baseUrl}/api/admin/stats`, { headers: authHeaders() });
  return parseJson(res, 'Failed to fetch stats');
}

export async function getUsers() {
  const res = await fetch(`${baseUrl}/api/admin/users`, { headers: authHeaders() });
  return parseJson(res, 'Failed to fetch users');
}

export async function createUser(payload: { username: string; password: string; is_admin: boolean }) {
  const res = await fetch(`${baseUrl}/api/admin/users`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return parseJson(res, 'Create user failed');
}

export async function deleteUser(id: string) {
  const res = await fetch(`${baseUrl}/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return parseJson(res, 'Delete failed');
}

export async function resetUserPassword(id: string, newPassword: string) {
  const res = await fetch(`${baseUrl}/api/admin/users/${id}/password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ new_password: newPassword }),
  });
  return parseJson(res, 'Password reset failed');
}

export async function setUserStatus(id: string, enabled: boolean) {
  const res = await fetch(`${baseUrl}/api/admin/users/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ enabled }),
  });
  return parseJson(res, 'Status update failed');
}

export async function getInvites() {
  const res = await fetch(`${baseUrl}/api/admin/invites`, { headers: authHeaders() });
  return parseJson(res, 'Failed to fetch invites');
}

export async function createInvite(expiresInDays = 7) {
  const res = await fetch(`${baseUrl}/api/admin/invites`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ expires_in_days: expiresInDays }),
  });
  return parseJson(res, 'Failed to create invite');
}
