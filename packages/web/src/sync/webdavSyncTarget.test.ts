import { describe, expect, it, vi } from 'vitest';
import { WebDavSyncTarget } from './webdavSyncTarget';

describe('WebDavSyncTarget', () => {
  it('creates the sync root when PROPFIND returns 404', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(textResponse('', 404))
      .mockResolvedValueOnce(textResponse('', 201));
    const target = new WebDavSyncTarget({
      id: 'webdav',
      baseUrl: 'https://dav.example.com/root',
      username: 'demo',
      password: 'secret',
      httpClient: { request },
    });

    const ok = await target.testConnection();

    expect(ok).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      url: 'https://dav.example.com/root/mlt-sync',
      method: 'PROPFIND',
    });
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      url: 'https://dav.example.com/root/mlt-sync/',
      method: 'MKCOL',
    });
  });

  it('creates directories and writes records plus manifest on push', async () => {
    const request = vi.fn(async (req: { url: string; method?: string }) => {
      if (req.method === 'PUT') return textResponse('', 201);
      if (req.url.endsWith('/manifest.json')) return textResponse('', 404);
      return textResponse('', 201);
    });
    const target = new WebDavSyncTarget({
      id: 'webdav',
      baseUrl: 'https://dav.example.com/root',
      username: 'demo',
      password: 'secret',
      httpClient: { request },
    });

    const result = await target.push([
      {
        table: 'tasks',
        key: 'task-1',
        data: '{"id":"task-1"}',
        version: 7,
        updatedAt: '2026-04-13T12:00:00.000Z',
        deletedAt: null,
      },
    ]);

    expect(result.currentVersion).toBe(7);
    const methods = request.mock.calls.map(([req]) => req.method ?? 'GET');
    expect(methods.filter((method) => method === 'MKCOL')).toHaveLength(6);
    expect(methods.filter((method) => method === 'PUT')).toHaveLength(2);
    expect(request.mock.calls.some(([req]) => req.url.endsWith('/data/tasks/task-1.json'))).toBe(true);
    expect(request.mock.calls.some(([req]) => req.url.endsWith('/manifest.json'))).toBe(true);
  });
});

function textResponse(bodyText: string, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {},
    text: vi.fn().mockResolvedValue(bodyText),
    json: vi.fn().mockImplementation(async () => JSON.parse(bodyText)),
  };
}
