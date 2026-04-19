import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMBEDDED_HOST_CONFIG,
  embeddedHostBaseUrl,
  normalizeEmbeddedHostConfig,
  validateEmbeddedHostConfig,
} from './embeddedHostContract';

describe('embeddedHostContract', () => {
  it('normalizes loopback config with none auth by default', () => {
    const config = normalizeEmbeddedHostConfig({});
    expect(config).toEqual(DEFAULT_EMBEDDED_HOST_CONFIG);
    expect(embeddedHostBaseUrl(config)).toBe('http://127.0.0.1:23981');
  });

  it('rejects none auth for LAN mode', () => {
    expect(() =>
      validateEmbeddedHostConfig({
        enabled: true,
        host: '0.0.0.0',
        port: 23981,
        authProvider: 'none',
        signupPolicy: 'invite_only',
      }),
    ).toThrow('LAN mode requires embedded auth.');
  });
});

