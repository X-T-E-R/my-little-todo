import { invoke } from '@tauri-apps/api/core';
import type { EmbeddedHostConfig, EmbeddedHostRuntimeState } from './embeddedHostContract';

export async function getEmbeddedHostRuntimeState(): Promise<EmbeddedHostRuntimeState> {
  return invoke<EmbeddedHostRuntimeState>('embedded_host_get_runtime_state');
}

export async function startEmbeddedHost(
  config: EmbeddedHostConfig,
): Promise<EmbeddedHostRuntimeState> {
  return invoke<EmbeddedHostRuntimeState>('embedded_host_start', { config });
}

export async function stopEmbeddedHost(): Promise<EmbeddedHostRuntimeState> {
  return invoke<EmbeddedHostRuntimeState>('embedded_host_stop');
}

export async function restartEmbeddedHost(
  config: EmbeddedHostConfig,
): Promise<EmbeddedHostRuntimeState> {
  return invoke<EmbeddedHostRuntimeState>('embedded_host_restart', { config });
}
