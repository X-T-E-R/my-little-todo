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
  const syncProvider = await getSetting('sync-provider');
  const syncConfig = parseJson<Record<string, string>>(await getSetting('sync-config'), {});

  return {
    enabled: enabledRaw !== 'false' && legacyAttachmentConfig.allow_attachments !== false,
    maxSize: Number(maxSizeRaw ?? legacyAttachmentConfig.max_size ?? 10 * 1024 * 1024),
    allowClipboardImages: allowPasteRaw !== 'false',
    routing: sanitizeRoutingRules(parseJson(routingRaw, defaultRoutingRules())),
    extensionOverrides: parseJson<Record<string, FileCategory>>(overridesRaw, {}),
    providers: {
      mltServer: {
        endpoint:
          parseJson<{ endpoint?: string }>(mltServerRaw, {}).endpoint ??
          (syncProvider === 'api-server' ? syncConfig.endpoint ?? '' : ''),
        authMode: parseJson<{ authMode?: 'session' | 'token' | 'credentials' }>(mltServerRaw, {})
          .authMode ??
          (syncProvider === 'api-server'
            ? ((syncConfig.auth_mode as 'token' | 'credentials' | undefined) ?? 'credentials')
            : 'session'),
        token: parseJson<{ token?: string }>(mltServerRaw, {}).token ?? syncConfig.token ?? '',
        username:
          parseJson<{ username?: string }>(mltServerRaw, {}).username ?? syncConfig.username ?? '',
        password:
          parseJson<{ password?: string }>(mltServerRaw, {}).password ?? syncConfig.password ?? '',
      },
      webdav: {
        endpoint: parseJson<{ endpoint?: string }>(webdavRaw, {}).endpoint ?? '',
        publicBaseUrl: parseJson<{ publicBaseUrl?: string }>(webdavRaw, {}).publicBaseUrl ?? '',
        username: parseJson<{ username?: string }>(webdavRaw, {}).username ?? '',
        password: parseJson<{ password?: string }>(webdavRaw, {}).password ?? '',
        directory: parseJson<{ directory?: string }>(webdavRaw, {}).directory ?? 'uploads',
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
