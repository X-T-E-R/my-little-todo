import type { PluginServerRouteResponse } from '@my-little-todo/plugin-sdk';
import type {
  RunnerToolDescriptor,
  RunnerHealthPayload,
  RunnerLaunchConfig,
  RunnerRouteRequest,
  RunnerStatus,
  RunnerToolCallRequest,
  RunnerToolCallResponse,
} from './types.js';
import { loadServerPlugin, normalizeToolResult, type LoadedServerPlugin } from './loader.js';

export class PluginRunnerSkeleton {
  private status: RunnerStatus = 'starting';
  private plugin: LoadedServerPlugin | null = null;

  constructor(private readonly config: RunnerLaunchConfig) {}

  health(): RunnerHealthPayload {
    return {
      pluginId: this.config.pluginId,
      status: this.status,
    };
  }

  async start(): Promise<void> {
    this.plugin = await loadServerPlugin(this.config);
    this.status = 'running';
  }

  async stop(): Promise<void> {
    if (this.plugin) {
      await this.plugin.definition.deactivate?.(this.plugin.context);
      this.plugin = null;
    }
    this.status = 'stopped';
  }

  async listTools(): Promise<RunnerToolDescriptor[]> {
    const tools = this.plugin?.definition.tools ?? {};
    return Object.keys(tools).map((name) => ({ name }));
  }

  async callTool(request: RunnerToolCallRequest): Promise<RunnerToolCallResponse> {
    if (!this.plugin) {
      throw new Error('Plugin runner has not been started yet.');
    }

    const tool = this.plugin.definition.tools?.[request.name];
    if (!tool) {
      throw new Error(`Unknown plugin tool: ${request.name}`);
    }

    return normalizeToolResult(await tool(request.arguments ?? {}, this.plugin.context));
  }

  async handleRoute(request: RunnerRouteRequest): Promise<PluginServerRouteResponse | null> {
    if (!this.plugin) {
      throw new Error('Plugin runner has not been started yet.');
    }

    const routeKey = normalizeRouteKey(request.method, request.path);
    const route = this.plugin.definition.routes?.[routeKey];
    if (!route) {
      return null;
    }

    return route(
      {
        method: request.method,
        path: normalizeRoutePath(request.path),
        query: request.query,
        headers: request.headers,
        bodyText: request.bodyText,
        bodyBytes: request.bodyBytes,
      },
      this.plugin.context,
    );
  }
}

function normalizeRouteKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizeRoutePath(path)}`;
}

function normalizeRoutePath(path: string): string {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}
