export type EmbeddedHostAuthProvider = 'none' | 'embedded';
export type EmbeddedHostSignupPolicy = 'admin_only' | 'open' | 'invite_only';
export type EmbeddedHostStatus = 'inactive' | 'starting' | 'running' | 'stopping' | 'failed';

export interface EmbeddedHostConfig {
  enabled: boolean;
  host: string;
  port: number;
  authProvider: EmbeddedHostAuthProvider;
  signupPolicy: EmbeddedHostSignupPolicy;
}

export interface EmbeddedHostRuntimeState {
  status: EmbeddedHostStatus;
  baseUrl: string | null;
  lastError?: string;
}

export const EMBEDDED_HOST_MODULE_ID = 'embedded-host';
export const EMBEDDED_HOST_CONFIG_KEYS = {
  enabled: `module:${EMBEDDED_HOST_MODULE_ID}:enabled`,
  host: 'embedded-host:host',
  port: 'embedded-host:port',
  authProvider: 'embedded-host:auth-provider',
  signupPolicy: 'embedded-host:signup-policy',
} as const;

export const DEFAULT_EMBEDDED_HOST_CONFIG: EmbeddedHostConfig = {
  enabled: false,
  host: '127.0.0.1',
  port: 23981,
  authProvider: 'none',
  signupPolicy: 'invite_only',
};

export function normalizeEmbeddedHostConfig(
  input: Partial<EmbeddedHostConfig>,
): EmbeddedHostConfig {
  return {
    enabled: input.enabled ?? DEFAULT_EMBEDDED_HOST_CONFIG.enabled,
    host: input.host?.trim() || DEFAULT_EMBEDDED_HOST_CONFIG.host,
    port:
      typeof input.port === 'number' && Number.isInteger(input.port) && input.port > 0
        ? input.port
        : DEFAULT_EMBEDDED_HOST_CONFIG.port,
    authProvider: input.authProvider === 'embedded' ? 'embedded' : 'none',
    signupPolicy:
      input.signupPolicy === 'admin_only' || input.signupPolicy === 'open'
        ? input.signupPolicy
        : 'invite_only',
  };
}

export function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost';
}

export function validateEmbeddedHostConfig(config: EmbeddedHostConfig): void {
  if (!isLoopbackHost(config.host) && config.authProvider === 'none') {
    throw new Error('LAN mode requires embedded auth.');
  }
}

export function embeddedHostBaseUrl(config: EmbeddedHostConfig): string {
  return `http://${config.host}:${config.port}`;
}

