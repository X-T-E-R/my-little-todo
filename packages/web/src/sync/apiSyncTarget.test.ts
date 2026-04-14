import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ApiServerSyncTarget', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  it('logs in through session api and pulls remote changes in credentials mode', async () => {
    const { ApiServerSyncTarget } = await import('./apiSyncTarget');
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'ok',
          version: '0.5.6',
          auth: 'embedded',
          db: 'sqlite',
          sync_mode: 'hosted',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          auth_provider: 'embedded',
          sync_mode: 'hosted',
          signup_policy: 'invite_only',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ token: 'mlt-session-token' }))
      .mockResolvedValueOnce(
        jsonResponse({
          changes: [
            {
              table: 'settings',
              key: 'theme',
              data: '{"key":"theme","value":"dark"}',
              version: 2,
              updated_at: '2026-04-15T00:00:00.000Z',
              deleted_at: null,
            },
          ],
          current_version: 2,
        }),
      );

    const target = new ApiServerSyncTarget({
      id: 'api',
      baseUrl: 'https://example.com',
      authMode: 'credentials',
      username: 'demo',
      password: 'secret',
      httpClient: { request },
    });

    await expect(target.pull(0)).resolves.toEqual({
      changes: [
        {
          table: 'settings',
          key: 'theme',
          data: '{"key":"theme","value":"dark"}',
          version: 2,
          updatedAt: '2026-04-15T00:00:00.000Z',
          deletedAt: null,
        },
      ],
      currentVersion: 2,
    });

    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls[2]?.[0]).toMatchObject({
      url: 'https://example.com/api/session/login',
      method: 'POST',
    });
    expect(request.mock.calls[3]?.[0]).toMatchObject({
      url: 'https://example.com/api/sync/changes?since=0',
      headers: {
        Authorization: 'Bearer mlt-session-token',
      },
    });
  });

  it('retries with a fresh session token after a 401 in credentials mode', async () => {
    const { ApiServerSyncTarget } = await import('./apiSyncTarget');
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'ok',
          version: '0.5.6',
          auth: 'embedded',
          db: 'sqlite',
          sync_mode: 'hosted',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          auth_provider: 'embedded',
          sync_mode: 'hosted',
          signup_policy: 'invite_only',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ token: 'expired-token' }))
      .mockResolvedValueOnce(textResponse('unauthorized', 401))
      .mockResolvedValueOnce(jsonResponse({ token: 'fresh-token' }))
      .mockResolvedValueOnce(jsonResponse({ current_version: 7 }));

    const target = new ApiServerSyncTarget({
      id: 'api',
      baseUrl: 'https://example.com',
      authMode: 'credentials',
      username: 'demo',
      password: 'secret',
      httpClient: { request },
    });

    await expect(target.getRemoteVersion()).resolves.toBe(7);
    expect(request).toHaveBeenCalledTimes(6);
    expect(request.mock.calls[3]?.[0]).toMatchObject({
      url: 'https://example.com/api/sync/status',
      headers: {
        Authorization: 'Bearer expired-token',
      },
    });
    expect(request.mock.calls[5]?.[0]).toMatchObject({
      url: 'https://example.com/api/sync/status',
      headers: {
        Authorization: 'Bearer fresh-token',
      },
    });
  });

  it('surfaces compatibility errors before attempting credential login', async () => {
    const { ApiServerSyncTarget } = await import('./apiSyncTarget');
    const request = vi
      .fn()
      .mockResolvedValueOnce(textResponse('<html>redirect</html>', 200, { 'content-type': 'text/html' }));

    const target = new ApiServerSyncTarget({
      id: 'api',
      baseUrl: 'https://example.com',
      authMode: 'credentials',
      username: 'demo',
      password: 'secret',
      httpClient: { request },
    });

    await expect(target.pull(0)).rejects.toThrow('returned an HTML page');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('returns false from testConnection when token mode has no usable token', async () => {
    const { ApiServerSyncTarget } = await import('./apiSyncTarget');
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'ok',
          version: '0.5.6',
          auth: 'embedded',
          db: 'sqlite',
          sync_mode: 'hosted',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ auth_provider: 'embedded', sync_mode: 'hosted' }));

    const target = new ApiServerSyncTarget({
      id: 'api',
      baseUrl: 'https://example.com',
      authMode: 'token',
      token: '',
      httpClient: { request },
    });

    await expect(target.testConnection()).resolves.toBe(false);
  });

  it('maps timeout errors to a user-friendly message', async () => {
    const { ApiServerSyncTarget } = await import('./apiSyncTarget');
    const request = vi.fn().mockRejectedValue(new Error('Request timed out after 10000ms'));
    const target = new ApiServerSyncTarget({
      id: 'api',
      baseUrl: 'https://example.com',
      httpClient: { request },
    });

    await expect(target.pull(0)).rejects.toThrow(
      'Connection timed out while contacting https://example.com',
    );
  });
});

function jsonResponse(data: unknown, status = 200) {
  const bodyText = JSON.stringify(data);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { 'content-type': 'application/json' },
    text: vi.fn().mockResolvedValue(bodyText),
    json: vi.fn().mockResolvedValue(data),
  };
}

function textResponse(bodyText: string, status = 200, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers,
    text: vi.fn().mockResolvedValue(bodyText),
    json: vi.fn().mockImplementation(async () => JSON.parse(bodyText)),
  };
}
