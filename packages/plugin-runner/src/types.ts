export type RunnerStatus = 'starting' | 'running' | 'stopping' | 'stopped';

export interface RunnerLaunchConfig {
  pluginId: string;
  pluginRoot: string;
  entryPoint: string;
  port: number;
  token: string;
}

export interface RunnerHealthPayload {
  pluginId: string;
  status: RunnerStatus;
}

export interface RunnerToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface RunnerToolDescriptor {
  name: string;
}

export interface RunnerToolCallResponse {
  content: unknown;
}

export interface RunnerRouteRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  bodyText?: string;
  bodyBytes?: Uint8Array;
}
