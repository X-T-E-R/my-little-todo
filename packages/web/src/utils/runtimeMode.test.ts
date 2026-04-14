import { describe, expect, it } from 'vitest';
import { resolveRuntimeMode } from './runtimeMode';

describe('resolveRuntimeMode', () => {
  it('uses local sqlite mode for tauri without a cloud url', () => {
    expect(resolveRuntimeMode('tauri', '')).toEqual({
      storeKind: 'tauri-sqlite',
      apiBase: '',
      authRuntime: 'local-native',
    });
  });

  it('uses api mode for tauri when a cloud url is configured', () => {
    expect(resolveRuntimeMode('tauri', 'https://example.com')).toEqual({
      storeKind: 'tauri-sqlite',
      apiBase: '',
      authRuntime: 'local-native',
    });
  });

  it('uses hosted api mode for web-hosted deployments', () => {
    expect(resolveRuntimeMode('web-hosted', '')).toEqual({
      storeKind: 'api',
      apiBase: '',
      authRuntime: 'server',
    });
  });
});
