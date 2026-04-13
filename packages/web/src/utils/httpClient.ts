import { isTauriEnv } from './platform';

export type HttpHeaders = Record<string, string>;

export interface HttpRequest {
  url: string;
  method?: string;
  headers?: HttpHeaders;
  bodyText?: string;
  bodyBytes?: Uint8Array | number[];
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: HttpHeaders;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export interface HttpClient {
  request(request: HttpRequest): Promise<HttpResponse>;
}

type FetchFn = typeof fetch;
type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

interface NativeHttpResponsePayload {
  status: number;
  ok: boolean;
  headers?: HttpHeaders;
  bodyText?: string;
}

interface HttpClientDeps {
  fetchFn?: FetchFn;
  invokeFn?: InvokeFn;
  isTauri?: () => boolean;
}

class MemoryHttpResponse implements HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: HttpHeaders;
  private readonly bodyTextValue: string;

  constructor(status: number, ok: boolean, headers: HttpHeaders, bodyText: string) {
    this.status = status;
    this.ok = ok;
    this.headers = headers;
    this.bodyTextValue = bodyText;
  }

  async text(): Promise<string> {
    return this.bodyTextValue;
  }

  async json<T = unknown>(): Promise<T> {
    return JSON.parse(this.bodyTextValue) as T;
  }
}

function normalizeHeaders(headers?: Headers | HeadersInit | HttpHeaders): HttpHeaders {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

function isAbsoluteHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function defaultInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

async function browserRequest(fetchFn: FetchFn, request: HttpRequest): Promise<HttpResponse> {
  const response = await fetchFn(request.url, {
    method: request.method ?? 'GET',
    headers: request.headers,
    body: request.bodyBytes ? new Uint8Array(request.bodyBytes) : request.bodyText,
    signal: request.timeoutMs ? AbortSignal.timeout(request.timeoutMs) : undefined,
  });
  const bodyText = await response.text();
  return new MemoryHttpResponse(
    response.status,
    response.ok,
    normalizeHeaders(response.headers),
    bodyText,
  );
}

async function tauriRequest(invokeFn: InvokeFn, request: HttpRequest): Promise<HttpResponse> {
  const response = await invokeFn<NativeHttpResponsePayload>('native_http_request', { req: request });
  return new MemoryHttpResponse(
    response.status,
    response.ok,
    normalizeHeaders(response.headers),
    response.bodyText ?? '',
  );
}

export function createHttpClient(deps: HttpClientDeps = {}): HttpClient {
  const fetchFn = deps.fetchFn ?? fetch;
  const invokeFn = deps.invokeFn ?? defaultInvoke;
  const isTauri = deps.isTauri ?? isTauriEnv;

  return {
    async request(request: HttpRequest): Promise<HttpResponse> {
      if (isTauri() && isAbsoluteHttpUrl(request.url)) {
        return tauriRequest(invokeFn, request);
      }
      return browserRequest(fetchFn, request);
    },
  };
}
