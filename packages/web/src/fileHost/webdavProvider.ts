import { createHttpClient, type HttpClient } from '../utils/httpClient';
import type { FileCategory, FileHostProvider, WebDavFileHostConfig } from './types';

function encodeBasicAuth(value: string): string {
  if (typeof btoa === 'function') return btoa(value);
  return Buffer.from(value, 'utf8').toString('base64');
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\s+/g, '-');
}

function buildRelativePath(directory: string, fileName: string): string {
  const dir = sanitizeSegment(directory);
  const cleanFileName = encodeURIComponent(fileName).replace(/%2F/gi, '-');
  return dir ? `${dir}/${cleanFileName}` : cleanFileName;
}

async function ensureDirectory(httpClient: HttpClient, endpoint: string, authHeaders: Record<string, string>, directory: string) {
  const segments = sanitizeSegment(directory).split('/').filter(Boolean);
  let acc = '';
  for (const segment of segments) {
    acc = acc ? `${acc}/${segment}` : segment;
    await httpClient.request({
      url: `${endpoint}/${acc}/`,
      method: 'MKCOL',
      headers: authHeaders,
    });
  }
}

export function createWebDavFileHostProvider(
  config: WebDavFileHostConfig & { httpClient?: HttpClient },
): FileHostProvider {
  const httpClient = config.httpClient ?? createHttpClient();

  return {
    id: 'webdav',
    async upload(file: File, category: FileCategory) {
      const endpoint = config.endpoint.replace(/\/+$/, '');
      const relativePath = buildRelativePath(config.directory, file.name);
      const authHeaders: Record<string, string> = {};
      if (config.username || config.password) {
        authHeaders.Authorization = `Basic ${encodeBasicAuth(`${config.username}:${config.password}`)}`;
      }

      if (config.directory.trim()) {
        await ensureDirectory(httpClient, endpoint, authHeaders, config.directory);
      }

      const buffer = await file.arrayBuffer();
      const response = await httpClient.request({
        url: `${endpoint}/${relativePath}`,
        method: 'PUT',
        headers: {
          ...authHeaders,
          'Content-Type': file.type || 'application/octet-stream',
        },
        bodyBytes: new Uint8Array(buffer),
      });
      if (!response.ok) {
        throw new Error(`WebDAV upload failed: HTTP ${response.status}`);
      }

      const publicBaseUrl = config.publicBaseUrl.replace(/\/+$/, '');
      return {
        provider: 'webdav',
        category,
        url: publicBaseUrl ? `${publicBaseUrl}/${relativePath}` : `${endpoint}/${relativePath}`,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      };
    },
  };
}
