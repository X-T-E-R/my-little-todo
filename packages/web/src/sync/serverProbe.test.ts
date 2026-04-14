import { describe, expect, it, vi } from 'vitest';
import { probeMltServer } from './serverProbe';

describe('probeMltServer', () => {
  it('accepts the current MLT server contract', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok', version: '0.5.6', auth: 'Multi' }))
      .mockResolvedValueOnce(jsonResponse({ mode: 'multi', needs_setup: false }))
      .mockResolvedValueOnce(jsonResponse({ current_version: 42 }));

    await expect(
      probeMltServer('https://example.com', {
        request,
      }),
    ).resolves.toMatchObject({
      status: 'ok',
      version: '0.5.6',
      auth: 'Multi',
    });

    expect(request).toHaveBeenCalledTimes(3);
  });

  it('rejects HTML health responses as invalid servers', async () => {
    const request = vi.fn().mockResolvedValue(
      textResponse('<html><title>Redirecting</title></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(
      probeMltServer('https://example.com', {
        request,
      }),
    ).rejects.toThrow('returned an HTML page');
  });

  it('rejects older servers that are missing auth mode endpoint', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok', version: '0.4.0' }))
      .mockResolvedValueOnce(textResponse('Not Found', { status: 404, ok: false }));

    await expect(
      probeMltServer('https://example.com', {
        request,
      }),
    ).rejects.toThrow('missing /api/auth/mode');
  });
});

function jsonResponse(data: unknown, status = 200) {
  return textResponse(JSON.stringify(data), {
    status,
    ok: status >= 200 && status < 300,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(
  bodyText: string,
  init: {
    status?: number;
    ok?: boolean;
    headers?: Record<string, string>;
  } = {},
) {
  const status = init.status ?? 200;
  return {
    status,
    ok: init.ok ?? (status >= 200 && status < 300),
    headers: init.headers ?? {},
    text: vi.fn().mockResolvedValue(bodyText),
    json: vi.fn().mockImplementation(async () => JSON.parse(bodyText)),
  };
}
