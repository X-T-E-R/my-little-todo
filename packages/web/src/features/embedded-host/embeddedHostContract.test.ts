import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMBEDDED_HOST_CONFIG,
  embeddedHostBaseUrl,
  normalizeEmbeddedHostConfig,
  sameEmbeddedHostConfig,
  validateEmbeddedHostConfig,
} from './embeddedHostContract';

describe('embeddedHostContract', () => {
  it('normalizes loopback config with none auth by default', () => {
    const config = normalizeEmbeddedHostConfig({});
    expect(config).toEqual(DEFAULT_EMBEDDED_HOST_CONFIG);
    expect(embeddedHostBaseUrl(config)).toBe('http://127.0.0.1:23981');
  });

  it('coerces unsupported desktop host settings back to loopback and no auth', () => {
    const config = normalizeEmbeddedHostConfig({
      enabled: true,
      host: '0.0.0.0',
      port: 24981,
      authProvider: 'embedded',
      signupPolicy: 'open',
    });

    expect(config).toEqual({
      enabled: true,
      host: '127.0.0.1',
      port: 24981,
      authProvider: 'none',
      signupPolicy: 'invite_only',
    });
  });

  it('rejects non-loopback desktop host configs', () => {
    expect(() =>
      validateEmbeddedHostConfig({
        enabled: true,
        host: '0.0.0.0',
        port: 23981,
        authProvider: 'none',
        signupPolicy: 'invite_only',
      }),
    ).toThrow('Desktop embedded host currently supports 127.0.0.1 or localhost only.');
  });

  it('compares embedded host configs structurally', () => {
    expect(
      sameEmbeddedHostConfig(DEFAULT_EMBEDDED_HOST_CONFIG, {
        ...DEFAULT_EMBEDDED_HOST_CONFIG,
      }),
    ).toBe(true);
    expect(
      sameEmbeddedHostConfig(DEFAULT_EMBEDDED_HOST_CONFIG, {
        ...DEFAULT_EMBEDDED_HOST_CONFIG,
        port: 24981,
      }),
    ).toBe(false);
  });
});
