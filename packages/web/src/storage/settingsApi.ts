import { getAuthToken } from '../stores/authStore';

let _apiBase = '';

export function setSettingsApiBase(url: string) {
  _apiBase = url;
}

export function getSettingsApiBase(): string {
  return _apiBase;
}

function headers(): HeadersInit {
  const h: HeadersInit = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function getSetting(key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${_apiBase}/api/settings?key=${encodeURIComponent(key)}`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.value ?? null;
  } catch {
    return null;
  }
}

export async function putSetting(key: string, value: string): Promise<void> {
  await fetch(`${_apiBase}/api/settings`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ key, value }),
  });
}

export async function deleteSetting(key: string): Promise<void> {
  await fetch(
    `${_apiBase}/api/settings?key=${encodeURIComponent(key)}`,
    { method: 'DELETE', headers: headers() },
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${_apiBase}/api/settings`, { headers: headers() });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}
