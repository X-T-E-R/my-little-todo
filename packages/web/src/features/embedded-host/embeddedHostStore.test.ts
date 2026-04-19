import { describe, expect, it, vi } from 'vitest';

vi.mock('./embeddedHostBridge', () => ({
  getEmbeddedHostRuntimeState: vi.fn(async () => ({
    status: 'inactive',
    baseUrl: null,
    lastError: undefined,
  })),
  startEmbeddedHost: vi.fn(),
  stopEmbeddedHost: vi.fn(),
  restartEmbeddedHost: vi.fn(),
}));

import {
  hasEmbeddedHostRuntimeConfigDrift,
  resolveDesktopHostBaseUrl,
} from './embeddedHostStore';

describe('embeddedHostStore', () => {
  it('returns null when the embedded host module is disabled', () => {
    expect(
      resolveDesktopHostBaseUrl({
        moduleEnabled: false,
        status: 'inactive',
        config: {
          enabled: false,
          host: '127.0.0.1',
          port: 23981,
          authProvider: 'none',
          signupPolicy: 'invite_only',
        },
      }),
    ).toBeNull();
  });

  it('returns the configured base url when the host is running', () => {
    expect(
      resolveDesktopHostBaseUrl({
        moduleEnabled: true,
        status: 'running',
        baseUrl: null,
        config: {
          enabled: true,
          host: '127.0.0.1',
          port: 23981,
          authProvider: 'none',
          signupPolicy: 'invite_only',
        },
      }),
    ).toBe('http://127.0.0.1:23981');
  });

  it('prefers the runtime base url when config changed before restart', () => {
    expect(
      resolveDesktopHostBaseUrl({
        moduleEnabled: true,
        status: 'running',
        baseUrl: 'http://127.0.0.1:23981',
        config: {
          enabled: true,
          host: '127.0.0.1',
          port: 24981,
          authProvider: 'none',
          signupPolicy: 'invite_only',
        },
      }),
    ).toBe('http://127.0.0.1:23981');
  });

  it('detects pending runtime config drift only while the host is running', () => {
    expect(
      hasEmbeddedHostRuntimeConfigDrift(
        {
          enabled: true,
          host: '127.0.0.1',
          port: 24981,
          authProvider: 'none',
          signupPolicy: 'invite_only',
        },
        {
          enabled: true,
          host: '127.0.0.1',
          port: 23981,
          authProvider: 'none',
          signupPolicy: 'invite_only',
        },
        'running',
      ),
    ).toBe(true);

    expect(
      hasEmbeddedHostRuntimeConfigDrift(
        {
          enabled: true,
          host: '127.0.0.1',
          port: 24981,
          authProvider: 'none',
          signupPolicy: 'invite_only',
        },
        {
          enabled: true,
          host: '127.0.0.1',
          port: 23981,
          authProvider: 'none',
          signupPolicy: 'invite_only',
        },
        'inactive',
      ),
    ).toBe(false);
  });
});
