import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSettingMock = vi.fn();
const getAttachmentConfigMock = vi.fn();

vi.mock('../storage/settingsApi', () => ({
  getSetting: (key: string) => getSettingMock(key),
  putSetting: vi.fn(),
}));

vi.mock('../storage/dataStore', () => ({
  getDataStore: () => ({
    getAttachmentConfig: getAttachmentConfigMock,
  }),
}));

describe('loadFileHostConfig', () => {
  beforeEach(() => {
    getSettingMock.mockReset();
    getAttachmentConfigMock.mockReset();
    getAttachmentConfigMock.mockResolvedValue({});
  });

  it('does not inherit retired sync-provider settings into the MLT server provider', async () => {
    const settings = new Map<string, string | null>([
      ['file-host:enabled', 'true'],
      ['file-host:max-size', '10485760'],
      ['file-host:allow-clipboard-images', 'true'],
      ['file-host:routing', null],
      ['file-host:extension-overrides', null],
      ['file-host:provider:mlt-server', null],
      ['file-host:provider:webdav', null],
      ['sync-provider', 'api-server'],
      ['sync-config', JSON.stringify({ endpoint: 'https://legacy.example.com', auth_mode: 'credentials', username: 'demo' })],
    ]);
    getSettingMock.mockImplementation(async (key: string) => settings.get(key) ?? null);

    const { loadFileHostConfig } = await import('./config');
    const config = await loadFileHostConfig();

    expect(config.providers.mltServer).toEqual({
      endpoint: '',
      authMode: 'session',
      token: '',
      username: '',
      password: '',
    });
  });
});
