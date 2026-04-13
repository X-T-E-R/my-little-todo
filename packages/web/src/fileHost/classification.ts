import type { FileCategory, FileHostProviderId, FileRoutingRule } from './types';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);
const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'md',
  'markdown',
  'txt',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'csv',
  'rtf',
]);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a']);
const ARCHIVE_EXTENSIONS = new Set(['zip', '7z', 'rar', 'tar', 'gz', 'tgz']);

const MIME_PREFIX_TO_CATEGORY: Array<[prefix: string, category: FileCategory]> = [
  ['image/', 'image'],
  ['video/', 'video'],
  ['audio/', 'audio'],
];

const MIME_EXACT_TO_CATEGORY: Record<string, FileCategory> = {
  'application/pdf': 'document',
  'text/markdown': 'document',
  'text/plain': 'document',
  'text/csv': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  'application/zip': 'archive',
  'application/x-7z-compressed': 'archive',
  'application/vnd.rar': 'archive',
  'application/x-rar-compressed': 'archive',
  'application/gzip': 'archive',
};

const DEFAULT_PROVIDER: FileHostProviderId = 'local-files';

function normalizedExtension(name: string): string {
  const ext = name.trim().split('.').pop()?.trim().toLowerCase() ?? '';
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

function categoryFromExtension(extension: string): FileCategory {
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (DOCUMENT_EXTENSIONS.has(extension)) return 'document';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (ARCHIVE_EXTENSIONS.has(extension)) return 'archive';
  return 'other';
}

function categoryFromMime(type: string): FileCategory | null {
  const normalized = type.trim().toLowerCase();
  if (!normalized) return null;
  for (const [prefix, category] of MIME_PREFIX_TO_CATEGORY) {
    if (normalized.startsWith(prefix)) return category;
  }
  return MIME_EXACT_TO_CATEGORY[normalized] ?? null;
}

export function categorizeFile(
  file: Pick<File, 'name' | 'type'>,
  extensionOverrides: Record<string, FileCategory> = {},
): FileCategory {
  const extension = normalizedExtension(file.name);
  if (extension && extensionOverrides[extension]) {
    return extensionOverrides[extension];
  }

  const byMime = categoryFromMime(file.type);
  if (byMime && file.type !== 'application/octet-stream') {
    return byMime;
  }

  return categoryFromExtension(extension);
}

export function pickProviderForCategory(
  category: FileCategory,
  routing: FileRoutingRule[],
): FileHostProviderId {
  const direct = routing.find((rule) => rule.category === category)?.provider;
  if (direct) return direct;
  return routing.find((rule) => rule.category === 'other')?.provider ?? DEFAULT_PROVIDER;
}

export function defaultRoutingRules(): FileRoutingRule[] {
  return [
    { category: 'image', provider: DEFAULT_PROVIDER },
    { category: 'document', provider: DEFAULT_PROVIDER },
    { category: 'video', provider: DEFAULT_PROVIDER },
    { category: 'audio', provider: DEFAULT_PROVIDER },
    { category: 'archive', provider: DEFAULT_PROVIDER },
    { category: 'other', provider: DEFAULT_PROVIDER },
  ];
}
