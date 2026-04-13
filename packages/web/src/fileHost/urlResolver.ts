import { getDataStore } from '../storage/dataStore';

const objectUrlCache = new Map<string, string>();

function extractBlobId(url: string): string | null {
  if (url.startsWith('blob://')) return url.slice('blob://'.length);
  return null;
}

export async function resolveFileHostUrl(url: string): Promise<string> {
  const blobId = extractBlobId(url);
  if (!blobId) return url;
  const cached = objectUrlCache.get(blobId);
  if (cached) return cached;

  const blob = await getDataStore().getBlobData(blobId);
  if (!blob) return url;

  const bytes = blob.data;
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const objectUrl = URL.createObjectURL(new Blob([buffer], { type: blob.mimeType }));
  objectUrlCache.set(blobId, objectUrl);
  return objectUrl;
}
