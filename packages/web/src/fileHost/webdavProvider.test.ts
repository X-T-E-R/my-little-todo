import { describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../utils/httpClient';
import { createWebDavFileHostProvider } from './webdavProvider';

describe('createWebDavFileHostProvider', () => {
  it('uploads a file and returns the public url', async () => {
    const request = vi.fn<(request: HttpRequest) => Promise<HttpResponse>>(async () =>
      textResponse('', 201),
    );
    const provider = createWebDavFileHostProvider({
      endpoint: 'https://dav.example.com/root',
      publicBaseUrl: 'https://cdn.example.com/files',
      username: 'demo',
      password: 'secret',
      directory: 'uploads/images',
      httpClient: { request },
    });

    const file = new File(['hello'], 'cover.png', { type: 'image/png' });
    const asset = await provider.upload(file, 'image');

    expect(asset.provider).toBe('webdav');
    expect(asset.url).toBe('https://cdn.example.com/files/uploads/images/cover.png');
    expect(request).toHaveBeenCalled();
    const putCall = request.mock.calls.find((call) => call[0]?.method === 'PUT');
    expect(putCall?.[0]).toMatchObject({
      method: 'PUT',
      url: 'https://dav.example.com/root/uploads/images/cover.png',
    });
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
