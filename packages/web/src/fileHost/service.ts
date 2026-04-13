import type { Attachment } from '@my-little-todo/core';
import { categorizeFile, pickProviderForCategory } from './classification';
import { loadFileHostConfig } from './config';
import { createLocalFileHostProvider } from './localProvider';
import { createMltServerFileHostProvider } from './mltServerProvider';
import type { FileCategory, FileHostAsset, FileHostProvider, FileHostProviderConfig } from './types';
import { createWebDavFileHostProvider } from './webdavProvider';

function getProvider(
  providerId: 'local-files' | 'mlt-server' | 'webdav',
  config: FileHostProviderConfig,
): FileHostProvider {
  switch (providerId) {
    case 'mlt-server':
      return createMltServerFileHostProvider(config.providers.mltServer);
    case 'webdav':
      return createWebDavFileHostProvider(config.providers.webdav);
    default:
      return createLocalFileHostProvider();
  }
}

export async function uploadFileWithHost(file: File): Promise<FileHostAsset> {
  const config = await loadFileHostConfig();
  if (!config.enabled) {
    throw new Error('File host is disabled');
  }
  if (file.size > config.maxSize) {
    throw new Error(`File too large: ${file.size}`);
  }

  const category = categorizeFile(file, config.extensionOverrides);
  const providerId = pickProviderForCategory(category, config.routing);
  const provider = getProvider(providerId, config);
  return provider.upload(file, category);
}

export function fileHostAssetToMarkdown(asset: FileHostAsset): string {
  return asset.category === 'image'
    ? `![${asset.fileName}](${asset.url})`
    : `[${asset.fileName}](${asset.url})`;
}

export function fileHostAssetToAttachment(asset: FileHostAsset): Attachment {
  return {
    type: asset.category === 'image' ? 'image' : 'file',
    url: asset.url,
    title: asset.fileName,
    id: asset.id,
    provider: asset.provider,
    category: asset.category,
    mimeType: asset.mimeType,
    size: asset.size,
  };
}

export function mergeAttachments(
  current: Attachment[],
  additions: Attachment[],
): Attachment[] {
  const next = [...current];
  for (const attachment of additions) {
    const key = attachment.id || attachment.url;
    if (next.some((existing) => (existing.id || existing.url) === key)) continue;
    next.push(attachment);
  }
  return next;
}

export function assetCategoryToAttachmentType(category: FileCategory): Attachment['type'] {
  return category === 'image' ? 'image' : 'file';
}
