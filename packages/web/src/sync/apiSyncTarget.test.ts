import { describe, expect, it, vi } from 'vitest';
import { ApiServerSyncTarget } from './apiSyncTarget';

describe('ApiServerSyncTarget', () => {
  it('fails fast with a migration message after validating a current server', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ status: 'ok', version: '0.5.6', auth: 'embedded', db: 'sqlite', sync_mode: 'hosted' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ auth_provider: 'embedded', sync_mode: 'hosted', signup_policy: 'invite_only' }),
      );

    const target = new ApiServerSyncTarget({
      id: 'api',
      baseUrl: 'https://example.com',
      authMode: 'credentials',
      username: 'demo',
      password: 'secret',
      httpClient: { request },
    });

    await expect(target.pull(0)).rejects.toThrow('Legacy API-server sync has been removed');
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      url: 'https://example.com/health',
    });
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      url: 'https://example.com/api/session/bootstrap',
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

  it('returns false from testConnection when legacy sync has been retired', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ status: 'ok', version: '0.5.6', auth: 'embedded', db: 'sqlite', sync_mode: 'hosted' }),
      )
      .mockResolvedValueOnce(jsonResponse({ auth_provider: 'embedded', sync_mode: 'hosted' }));
    const target = new ApiServerSyncTarget({
      id: 'api',
      baseUrl: 'https://example.com',
      authMode: 'token',
      token: 'demo-token',
      httpClient: { request },
    });

    await expect(target.testConnection()).resolves.toBe(false);
  });

  it('maps timeout errors to a user-friendly message', async () => {
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
