import { getAuthToken } from '../stores/authStore';
import { getSettingsApiBase } from './settingsApi';

function authHeaders(): HeadersInit {
  const h: HeadersInit = {};
  const token = getAuthToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

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
  const base = getSettingsApiBase();
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${base}/api/blobs/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }

  return res.json();
}

export async function getAttachmentConfig(): Promise<AttachmentConfig> {
  const base = getSettingsApiBase();
  try {
    const res = await fetch(`${base}/api/blobs/config`, {
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      return { allow_attachments: true, max_size: 10 * 1024 * 1024, storage: 'local', image_host_url: '' };
    }
    return res.json();
  } catch {
    return { allow_attachments: true, max_size: 10 * 1024 * 1024, storage: 'local', image_host_url: '' };
  }
}

export async function deleteBlob(id: string): Promise<void> {
  const base = getSettingsApiBase();
  await fetch(`${base}/api/blobs/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export function blobUrl(id: string): string {
  const base = getSettingsApiBase();
  return `${base}/api/blobs/${id}`;
}
