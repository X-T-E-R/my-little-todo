import { describe, expect, it, vi } from 'vitest';
import { createHttpClient } from './httpClient';

describe('httpClient', () => {
  it('routes absolute http urls through the tauri transport', async () => {
    const fetchFn = vi.fn();
    const invokeFn = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: { 'content-type': 'application/json' },
      bodyText: '{"ok":true}',
    });
    const client = createHttpClient({
      fetchFn: fetchFn as unknown as typeof fetch,
      invokeFn,
      isTauri: () => true,
    });

    const response = await client.request({
      url: 'https://example.com/api/test',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      bodyText: '{"hello":"world"}',
      timeoutMs: 1234,
    });

    expect(invokeFn).toHaveBeenCalledWith('native_http_request', {
      req: {
        url: 'https://example.com/api/test',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        bodyText: '{"hello":"world"}',
        timeoutMs: 1234,
      },
    });
    expect(fetchFn).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('uses browser fetch for relative urls even in tauri', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 204,
      ok: true,
      headers: new Headers({ 'x-test': 'ok' }),
      text: vi.fn().mockResolvedValue(''),
    });
    const invokeFn = vi.fn();
    const client = createHttpClient({
      fetchFn: fetchFn as unknown as typeof fetch,
      invokeFn,
      isTauri: () => true,
    });

    const response = await client.request({
      url: '/health',
      timeoutMs: 5000,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(invokeFn).not.toHaveBeenCalled();
    await expect(response.text()).resolves.toBe('');
    expect(response.headers['x-test']).toBe('ok');
  });
});
