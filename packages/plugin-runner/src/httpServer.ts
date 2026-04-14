import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { PluginServerRouteResponse } from '@my-little-todo/plugin-sdk';
import { PluginRunnerSkeleton } from './runner.js';
import type { RunnerLaunchConfig, RunnerRouteRequest, RunnerToolCallRequest } from './types.js';

const TOKEN_HEADER = 'x-mlt-plugin-token';

export interface RunnerHttpServerHandle {
  baseUrl: string;
  close(): Promise<void>;
}

export async function startRunnerHttpServer(
  config: RunnerLaunchConfig,
  runner: PluginRunnerSkeleton,
): Promise<RunnerHttpServerHandle> {
  const server = createServer(async (request, response) => {
    try {
      if (!isAuthorized(request, config.token)) {
        await respondJson(response, 401, { error: 'Unauthorized runner request' });
        return;
      }

      const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${config.port}`);
      const method = (request.method ?? 'GET').toUpperCase();

      if (method === 'GET' && requestUrl.pathname === '/health') {
        await respondJson(response, 200, runner.health());
        return;
      }

      if (method === 'POST' && requestUrl.pathname === '/mcp/tools/list') {
        await respondJson(response, 200, { tools: await runner.listTools() });
        return;
      }

      if (method === 'POST' && requestUrl.pathname === '/mcp/tools/call') {
        const payload = (await readJsonBody(request)) as RunnerToolCallRequest;
        if (!payload?.name) {
          await respondJson(response, 400, { error: 'Missing tool name' });
          return;
        }
        await respondJson(response, 200, await runner.callTool(payload));
        return;
      }

      const bodyBytes = await readBody(request);
      const routeResponse = await runner.handleRoute(
        toRunnerRouteRequest(request, requestUrl, method, bodyBytes),
      );
      if (!routeResponse) {
        await respondJson(response, 404, {
          error: `Unknown plugin route: ${method} ${requestUrl.pathname}`,
        });
        return;
      }

      await respondRoute(response, routeResponse);
    } catch (error) {
      await respondJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await listen(server, config.port);

  return {
    baseUrl: `http://127.0.0.1:${config.port}`,
    close: () => close(server),
  };
}

function isAuthorized(request: IncomingMessage, token: string): boolean {
  const headerToken = request.headers[TOKEN_HEADER];
  const bearer = request.headers.authorization;
  if (typeof headerToken === 'string' && headerToken === token) {
    return true;
  }
  if (typeof bearer === 'string' && bearer === `Bearer ${token}`) {
    return true;
  }
  return false;
}

function toRunnerRouteRequest(
  request: IncomingMessage,
  requestUrl: URL,
  method: string,
  bodyBytes: Uint8Array,
): RunnerRouteRequest {
  return {
    method,
    path: requestUrl.pathname,
    query: Object.fromEntries(requestUrl.searchParams.entries()),
    headers: flattenHeaders(request),
    bodyText: bodyBytes.length > 0 ? new TextDecoder().decode(bodyBytes) : undefined,
    bodyBytes: bodyBytes.length > 0 ? bodyBytes : undefined,
  };
}

function flattenHeaders(request: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') {
      headers[key] = value;
    } else if (Array.isArray(value)) {
      headers[key] = value.join(', ');
    }
  }
  return headers;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const bytes = await readBody(request);
  if (bytes.length === 0) {
    return {};
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function readBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function respondJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
): Promise<void> {
  const body = Buffer.from(JSON.stringify(payload));
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.setHeader('content-length', body.byteLength);
  response.end(body);
}

async function respondRoute(
  response: ServerResponse,
  routeResponse: PluginServerRouteResponse,
): Promise<void> {
  response.statusCode = routeResponse.status;
  for (const [key, value] of Object.entries(routeResponse.headers ?? {})) {
    response.setHeader(key, value);
  }

  const contentType = routeResponse.contentType ?? inferContentType(routeResponse);
  if (contentType && !response.hasHeader('content-type')) {
    response.setHeader('content-type', contentType);
  }

  if (routeResponse.json !== undefined) {
    response.end(Buffer.from(JSON.stringify(routeResponse.json)));
    return;
  }
  if (routeResponse.bodyText !== undefined) {
    response.end(routeResponse.bodyText);
    return;
  }
  if (routeResponse.bodyBytes) {
    response.end(Buffer.from(routeResponse.bodyBytes));
    return;
  }
  response.end();
}

function inferContentType(routeResponse: PluginServerRouteResponse): string | undefined {
  if (routeResponse.contentType) {
    return routeResponse.contentType;
  }
  if (routeResponse.json !== undefined) {
    return 'application/json';
  }
  if (routeResponse.bodyText !== undefined) {
    return 'text/plain';
  }
  return undefined;
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
