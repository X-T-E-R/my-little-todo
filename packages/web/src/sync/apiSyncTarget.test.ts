import { describe, expect, it, vi } from 'vitest';

vi.mock('../stores/authStore', () => ({
  getAuthToken: () => null,
}));

import { ApiServerSyncTarget } from './apiSyncTarget';

describe('ApiServerSyncTarget', () => {
  it('logs in with credentials and reuses the JWT for sync requests', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok', version: '0.5.6', auth: 'Multi' }))
      .mockResolvedValueOnce(jsonResponse({ mode: 'multi', needs_setup: false }))
      .mockResolvedValueOnce(jsonResponse({ current_version: 0 }))
      .mockResolvedValueOnce(jsonResponse({ token: 'jwt-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          changes: [
            {
              table: 'tasks',
              key: 'task-1',
              data: '{"id":"task-1"}',
              version: 2,
              updated_at: 1_700_000_000_000,
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

    const result = await target.pull(0);

    expect(request).toHaveBeenCalledTimes(5);
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      url: 'https://example.com/health',
    });
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      url: 'https://example.com/api/auth/mode',
    });
    expect(request.mock.calls[2]?.[0]).toMatchObject({
      url: 'https://example.com/api/sync/status',
    });
    expect(request.mock.calls[3]?.[0]).toMatchObject({
      url: 'https://example.com/api/auth/login',
      method: 'POST',
    });
    expect(request.mock.calls[4]?.[0]).toMatchObject({
      url: 'https://example.com/api/sync/changes?since=0',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer jwt-1',
      },
    });
    expect(result.currentVersion).toBe(2);
    expect(result.changes[0]?.updatedAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('refreshes credentials and retries once on 401', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok', version: '0.5.6', auth: 'Multi' }))
      .mockResolvedValueOnce(jsonResponse({ mode: 'multi', needs_setup: false }))
      .mockResolvedValueOnce(jsonResponse({ current_version: 0 }))
      .mockResolvedValueOnce(jsonResponse({ token: 'jwt-1' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ token: 'jwt-2' }))
      .mockResolvedValueOnce(jsonResponse({ current_version: 9 }));

    const target = new ApiServerSyncTarget({
      id: 'api',
      baseUrl: 'https://example.com',
      authMode: 'credentials',
      username: 'demo',
      password: 'secret',
      httpClient: { request },
    });

    const version = await target.getRemoteVersion();

    expect(version).toBe(9);
    expect(request).toHaveBeenCalledTimes(7);
    expect(request.mock.calls[6]?.[0]).toMatchObject({
      url: 'https://example.com/api/sync/status',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer jwt-2',
      },
    });
  });

  it('surfaces compatibility errors before attempting credential login', async () => {
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

  it('maps timeout errors to a user-friendly message', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok', version: '0.5.6', auth: 'None' }))
      .mockResolvedValueOnce(jsonResponse({ mode: 'none', needs_setup: false }))
      .mockResolvedValueOnce(jsonResponse({ current_version: 0 }))
      .mockRejectedValue(new Error('Request timed out after 10000ms'));
    const target = new ApiServerSyncTarget({
      id: 'api',
      baseUrl: 'https://example.com',
      authMode: 'token',
      token: 'demo-token',
      httpClient: { request },
    });

    await expect(target.getRemoteVersion()).rejects.toThrow(
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
