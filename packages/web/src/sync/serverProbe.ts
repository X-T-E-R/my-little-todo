import { createHttpClient, type HttpClient, type HttpResponse } from '../utils/httpClient';
import { isTauriEnv } from '../utils/platform';

export interface MltServerHealth {
  status: string;
  version?: string;
  auth?: string;
  db?: string;
}

function isCrossOriginTarget(baseUrl: string): boolean {
  if (typeof window === 'undefined' || !baseUrl) return false;
  try {
    return new URL(baseUrl).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function formatSyncRequestError(baseUrl: string, err: unknown): Error {
  if (
    err instanceof Error &&
    (err.name === 'TimeoutError' || /timeout|timed out/i.test(err.message))
  ) {
    return new Error(`Connection timed out while contacting ${baseUrl}`);
  }

  if (
    !isTauriEnv() &&
    err instanceof TypeError &&
    err.message === 'Failed to fetch' &&
    isCrossOriginTarget(baseUrl)
  ) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'this app';
    return new Error(
      `Cross-origin request blocked. Add ${origin} to CORS_ALLOWED_ORIGINS on ${baseUrl}.`,
    );
  }

  if (err instanceof Error) return err;
  return new Error(String(err));
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function joinUrl(baseUrl: string, path: string): string {
  return baseUrl ? `${baseUrl}${path}` : path;
}

function looksLikeHtml(bodyText: string, response: HttpResponse): boolean {
  const contentType =
    response.headers['content-type'] ?? response.headers['Content-Type'] ?? '';
  return /text\/html/i.test(contentType) || /^\s*</.test(bodyText);
}

function parseJsonObject(
  bodyText: string,
  response: HttpResponse,
  label: string,
): Record<string, unknown> {
  if (looksLikeHtml(bodyText, response)) {
    throw new Error(
      `The server at ${label} returned an HTML page instead of My Little Todo API JSON.`,
    );
  }

  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`The server at ${label} returned invalid JSON for this app version.`);
  }
}

async function requestText(
  httpClient: HttpClient,
  baseUrl: string,
  path: string,
  timeoutMs: number,
): Promise<{ response: HttpResponse; bodyText: string }> {
  const url = joinUrl(baseUrl, path);
  const response = await httpClient.request({ url, timeoutMs });
  const bodyText = await response.text();
  return { response, bodyText };
}

export async function probeMltServer(
  baseUrl: string,
  httpClient: HttpClient = createHttpClient(),
): Promise<MltServerHealth> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  try {
    const { response: healthResponse, bodyText: healthText } = await requestText(
      httpClient,
      normalizedBaseUrl,
      '/health',
      5000,
    );
    if (!healthResponse.ok) {
      throw new Error(`Health check failed: HTTP ${healthResponse.status}`);
    }

    const healthJson = parseJsonObject(
      healthText,
      healthResponse,
      joinUrl(normalizedBaseUrl, '/health'),
    );
    if (healthJson.status !== 'ok') {
      throw new Error('The server health response is not compatible with this app version.');
    }

    const { response: authResponse, bodyText: authText } = await requestText(
      httpClient,
      normalizedBaseUrl,
      '/api/auth/mode',
      5000,
    );
    if (authResponse.status === 404) {
      throw new Error(
        'This server is missing /api/auth/mode and looks older than the current My Little Todo app.',
      );
    }
    if (!authResponse.ok) {
      throw new Error(`Authentication probe failed: HTTP ${authResponse.status}`);
    }
    const authJson = parseJsonObject(
      authText,
      authResponse,
      joinUrl(normalizedBaseUrl, '/api/auth/mode'),
    );
    if (typeof authJson.mode !== 'string') {
      throw new Error('The server returned an invalid auth mode response.');
    }

    const { response: syncResponse, bodyText: syncText } = await requestText(
      httpClient,
      normalizedBaseUrl,
      '/api/sync/status',
      5000,
    );
    if (syncResponse.status === 404) {
      throw new Error(
        'This server is missing /api/sync/status and looks older than the current My Little Todo app.',
      );
    }
    if (syncResponse.ok) {
      const syncJson = parseJsonObject(
        syncText,
        syncResponse,
        joinUrl(normalizedBaseUrl, '/api/sync/status'),
      );
      if (typeof syncJson.current_version !== 'number') {
        throw new Error('The server returned an invalid sync status response.');
      }
    } else if (![401, 403].includes(syncResponse.status)) {
      throw new Error(`Sync probe failed: HTTP ${syncResponse.status}`);
    }

    return {
      status: 'ok',
      version: typeof healthJson.version === 'string' ? healthJson.version : undefined,
      auth: typeof healthJson.auth === 'string' ? healthJson.auth : undefined,
      db: typeof healthJson.db === 'string' ? healthJson.db : undefined,
    };
  } catch (err) {
    throw formatSyncRequestError(
      normalizedBaseUrl ||
        (typeof window !== 'undefined' ? window.location.origin : 'this app'),
      err,
    );
  }
}
