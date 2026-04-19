import { invoke } from '@tauri-apps/api/core';
import type { PluginServerController } from './pluginServerRuntime';

interface PluginRunnerRuntimeState {
  pluginId: string;
  status: 'inactive' | 'starting' | 'running' | 'stopping' | 'failed';
  baseUrl: string | null;
  token: string | null;
  lastError?: string;
}

interface PluginRunnerStartRequest {
  pluginId: string;
  entryPoint: string;
}

export async function startDesktopPluginRunner(
  request: PluginRunnerStartRequest,
): Promise<PluginServerController> {
  const runtime = await invoke<PluginRunnerRuntimeState>('plugin_runner_start', { request });
  if (runtime.status !== 'running' || !runtime.baseUrl || !runtime.token) {
    throw new Error(runtime.lastError || 'Plugin runner failed to start.');
  }

  return {
    baseUrl: runtime.baseUrl,
    token: runtime.token,
    stop: () => stopDesktopPluginRunner(request.pluginId),
    onExit(callback) {
      let timer: number | null = window.setInterval(async () => {
        try {
          const state = await getDesktopPluginRunnerRuntimeState(request.pluginId);
          if (state.status === 'running') return;
          if (timer !== null) {
            window.clearInterval(timer);
            timer = null;
          }
          callback(state.lastError);
        } catch (error) {
          if (timer !== null) {
            window.clearInterval(timer);
            timer = null;
          }
          callback(error instanceof Error ? error.message : String(error));
        }
      }, 1500);

      return () => {
        if (timer !== null) {
          window.clearInterval(timer);
          timer = null;
        }
      };
    },
  };
}

export async function stopDesktopPluginRunner(pluginId: string): Promise<void> {
  await invoke<PluginRunnerRuntimeState>('plugin_runner_stop', { pluginId });
}

export async function getDesktopPluginRunnerRuntimeState(
  pluginId: string,
): Promise<PluginRunnerRuntimeState> {
  return invoke<PluginRunnerRuntimeState>('plugin_runner_get_runtime_state', { pluginId });
}
