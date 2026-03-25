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
  return getDataStore().uploadBlob(file);
}

export async function getAttachmentConfig(): Promise<AttachmentConfig> {
  return getDataStore().getAttachmentConfig();
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
