import { getDataStore } from '../storage/dataStore';
import { getSetting, putSetting } from '../storage/settingsApi';
import type { FileCategory, FileHostProviderConfig, FileRoutingRule } from './types';
import { defaultRoutingRules } from './classification';

const FILE_HOST_ENABLED_KEY = 'file-host:enabled';
const FILE_HOST_MAX_SIZE_KEY = 'file-host:max-size';
const FILE_HOST_ALLOW_PASTE_KEY = 'file-host:allow-clipboard-images';
const FILE_HOST_ROUTING_KEY = 'file-host:routing';
const FILE_HOST_EXTENSION_OVERRIDES_KEY = 'file-host:extension-overrides';
const FILE_HOST_MLT_SERVER_KEY = 'file-host:provider:mlt-server';
const FILE_HOST_WEBDAV_KEY = 'file-host:provider:webdav';

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function sanitizeRoutingRules(raw: FileRoutingRule[]): FileRoutingRule[] {
  const validCategories: FileCategory[] = ['image', 'document', 'video', 'audio', 'archive', 'other'];
  const validProviders = new Set(['local-files', 'mlt-server', 'webdav']);
  const filtered = raw.filter(
    (rule) =>
      validCategories.includes(rule.category) &&
      typeof rule.provider === 'string' &&
      validProviders.has(rule.provider),
  );
  return filtered.length > 0 ? filtered : defaultRoutingRules();
}

export async function loadFileHostConfig(): Promise<FileHostProviderConfig> {
  const [enabledRaw, maxSizeRaw, allowPasteRaw, routingRaw, overridesRaw, mltServerRaw, webdavRaw] =
    await Promise.all([
      getSetting(FILE_HOST_ENABLED_KEY),
      getSetting(FILE_HOST_MAX_SIZE_KEY),
      getSetting(FILE_HOST_ALLOW_PASTE_KEY),
      getSetting(FILE_HOST_ROUTING_KEY),
      getSetting(FILE_HOST_EXTENSION_OVERRIDES_KEY),
      getSetting(FILE_HOST_MLT_SERVER_KEY),
      getSetting(FILE_HOST_WEBDAV_KEY),
    ]);

  const legacyAttachmentConfig = await getDataStore().getAttachmentConfig();
  const mltServerConfig = parseJson<{
    endpoint?: string;
    authMode?: 'session' | 'token';
    token?: string;
    username?: string;
    password?: string;
  }>(mltServerRaw, {});
  const webdavConfig = parseJson<{
    endpoint?: string;
    publicBaseUrl?: string;
    username?: string;
    password?: string;
    directory?: string;
  }>(webdavRaw, {});

  return {
    enabled: enabledRaw !== 'false' && legacyAttachmentConfig.allow_attachments !== false,
    maxSize: Number(maxSizeRaw ?? legacyAttachmentConfig.max_size ?? 10 * 1024 * 1024),
    allowClipboardImages: allowPasteRaw !== 'false',
    routing: sanitizeRoutingRules(parseJson(routingRaw, defaultRoutingRules())),
    extensionOverrides: parseJson<Record<string, FileCategory>>(overridesRaw, {}),
    providers: {
      mltServer: {
        endpoint: mltServerConfig.endpoint ?? '',
        authMode: mltServerConfig.authMode ?? 'session',
        token: mltServerConfig.token ?? '',
        username: mltServerConfig.username ?? '',
        password: mltServerConfig.password ?? '',
      },
      webdav: {
        endpoint: webdavConfig.endpoint ?? '',
        publicBaseUrl: webdavConfig.publicBaseUrl ?? '',
        username: webdavConfig.username ?? '',
        password: webdavConfig.password ?? '',
        directory: webdavConfig.directory ?? 'uploads',
      },
    },
  };
}

export async function saveFileHostConfig(config: FileHostProviderConfig): Promise<void> {
  await Promise.all([
    putSetting(FILE_HOST_ENABLED_KEY, String(config.enabled)),
    putSetting(FILE_HOST_MAX_SIZE_KEY, String(config.maxSize)),
    putSetting(FILE_HOST_ALLOW_PASTE_KEY, String(config.allowClipboardImages)),
    putSetting(FILE_HOST_ROUTING_KEY, JSON.stringify(config.routing)),
    putSetting(FILE_HOST_EXTENSION_OVERRIDES_KEY, JSON.stringify(config.extensionOverrides)),
    putSetting(FILE_HOST_MLT_SERVER_KEY, JSON.stringify(config.providers.mltServer)),
    putSetting(FILE_HOST_WEBDAV_KEY, JSON.stringify(config.providers.webdav)),
  ]);
}
