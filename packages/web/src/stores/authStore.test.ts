import { beforeEach, describe, expect, it, vi } from 'vitest';

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('authStore local native mode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', createStorageMock());
    vi.stubGlobal('fetch', vi.fn());
  });

  it('bypasses server bootstrap and signs in the local desktop user', async () => {
    const { useAuthStore } = await import('./authStore');

    useAuthStore.getState().setRuntime('local-native', '');
    await useAuthStore.getState().checkAuthMode();

    expect(fetch).not.toHaveBeenCalled();
    expect(useAuthStore.getState().authMode).toBe(null);
    expect(useAuthStore.getState().bootstrap?.auth_provider).toBe('none');
    expect(useAuthStore.getState().user).toMatchObject({
      id: 'local-desktop-user',
      username: 'local',
    });
  });
});
