import { loadFileHostConfig } from '../fileHost/config';
import { uploadFileWithHost } from '../fileHost/service';
import { getDataStore } from './dataStore';
import { getSettingsApiBase } from './settingsApi';

export interface UploadResult {
  id: string;
  url: string;
  filename: string;
  mime_type: string;
  size: number;
}

export interface AttachmentConfig {
  allow_attachments: boolean;
  max_size: number;
  storage: string;
  image_host_url: string;
}

export async function uploadBlob(file: File): Promise<UploadResult> {
  const asset = await uploadFileWithHost(file);
  return {
    id: asset.id ?? asset.url,
    url: asset.url,
    filename: asset.fileName,
    mime_type: asset.mimeType,
    size: asset.size,
  };
}

export async function getAttachmentConfig(): Promise<AttachmentConfig> {
  const config = await loadFileHostConfig();
  return {
    allow_attachments: config.enabled,
    max_size: config.maxSize,
    storage: config.routing.find((rule) => rule.category === 'image')?.provider ?? 'local-files',
    image_host_url: config.providers.mltServer.endpoint || config.providers.webdav.publicBaseUrl,
  };
}

export async function deleteBlob(id: string): Promise<void> {
  return getDataStore().deleteBlob(id);
}

export function blobUrl(id: string): string {
  return getDataStore().getBlobUrl(id);
}

/**
 * @deprecated Use `getDataStore().getBlobUrl()` instead.
 * Kept for backward compatibility in places that import getSettingsApiBase.
 */
export function legacyBlobUrl(id: string): string {
  const base = getSettingsApiBase();
  return `${base}/api/blobs/${id}`;
}
