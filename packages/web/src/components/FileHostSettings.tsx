import type { FileCategory, FileHostProviderId, FileRoutingRule } from '../fileHost/types';
import { CloudUpload, FolderArchive, Image as ImageIcon, Link2, Server, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadFileHostConfig, saveFileHostConfig } from '../fileHost/config';
import { useAuthStore } from '../stores/authStore';
import { getSetting, putSetting } from '../storage/settingsApi';
import { isNativeClient } from '../utils/platform';

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
      }`}
    >
      <span
        className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function parseOverrideLines(text: string): Record<string, FileCategory> {
  const out: Record<string, FileCategory> = {};
  const validCategories = new Set<FileCategory>([
    'image',
    'document',
    'video',
    'audio',
    'archive',
    'other',
  ]);
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [extRaw, categoryRaw] = trimmed.split('=').map((part) => part.trim().toLowerCase());
    if (!extRaw || !categoryRaw) continue;
    if (!validCategories.has(categoryRaw as FileCategory)) continue;
    out[extRaw.replace(/^\./, '')] = categoryRaw as FileCategory;
  }
  return out;
}

function serializeOverrides(overrides: Record<string, FileCategory>): string {
  return Object.entries(overrides)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([extension, category]) => `${extension}=${category}`)
    .join('\n');
}

export function FileHostSettings() {
  const { t } = useTranslation('settings');
  const isAdmin = useAuthStore((s) => s.user?.is_admin ?? false);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [allowClipboardImages, setAllowClipboardImages] = useState(true);
  const [maxSizeMb, setMaxSizeMb] = useState('10');
  const [routing, setRouting] = useState<FileRoutingRule[]>([]);
  const [overridesText, setOverridesText] = useState('');
  const [mltEndpoint, setMltEndpoint] = useState('');
  const [mltAuthMode, setMltAuthMode] = useState<'session' | 'token' | 'credentials'>('session');
  const [mltToken, setMltToken] = useState('');
  const [mltUsername, setMltUsername] = useState('');
  const [mltPassword, setMltPassword] = useState('');
  const [webdavEndpoint, setWebdavEndpoint] = useState('');
  const [webdavPublicBaseUrl, setWebdavPublicBaseUrl] = useState('');
  const [webdavUsername, setWebdavUsername] = useState('');
  const [webdavPassword, setWebdavPassword] = useState('');
  const [webdavDirectory, setWebdavDirectory] = useState('uploads');

  const [serverEnabled, setServerEnabled] = useState(true);
  const [serverMaxSizeMb, setServerMaxSizeMb] = useState('10');
  const [serverPublicBaseUrl, setServerPublicBaseUrl] = useState('');

  const categories: Array<{ id: FileCategory; label: string }> = [
    { id: 'image', label: t('Images') },
    { id: 'document', label: t('Documents') },
    { id: 'video', label: t('Videos') },
    { id: 'audio', label: t('Audio') },
    { id: 'archive', label: t('Archives') },
    { id: 'other', label: t('Other files') },
  ];

  const providers: Array<{ id: FileHostProviderId; label: string }> = [
    { id: 'local-files', label: t('Local files') },
    { id: 'mlt-server', label: t('MLT Server') },
    { id: 'webdav', label: t('WebDAV') },
  ];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const config = await loadFileHostConfig();
      const adminEnabled = await getSetting('admin:file-host:enabled');
      const adminMaxSize = await getSetting('admin:file-host:max-size');
      const adminPublicBaseUrl = await getSetting('admin:file-host:public-base-url');
      if (cancelled) return;

      setEnabled(config.enabled);
      setAllowClipboardImages(config.allowClipboardImages);
      setMaxSizeMb(String(Math.max(1, Math.round(config.maxSize / (1024 * 1024)))));
      setRouting(config.routing);
      setOverridesText(serializeOverrides(config.extensionOverrides));
      setMltEndpoint(config.providers.mltServer.endpoint);
      setMltAuthMode(config.providers.mltServer.authMode);
      setMltToken(config.providers.mltServer.token);
      setMltUsername(config.providers.mltServer.username);
      setMltPassword(config.providers.mltServer.password);
      setWebdavEndpoint(config.providers.webdav.endpoint);
      setWebdavPublicBaseUrl(config.providers.webdav.publicBaseUrl);
      setWebdavUsername(config.providers.webdav.username);
      setWebdavPassword(config.providers.webdav.password);
      setWebdavDirectory(config.providers.webdav.directory || 'uploads');
      setServerEnabled(adminEnabled !== 'false');
      setServerMaxSizeMb(
        String(Math.max(1, Math.round(Number(adminMaxSize ?? 10 * 1024 * 1024) / (1024 * 1024)))),
      );
      setServerPublicBaseUrl(adminPublicBaseUrl ?? '');
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const routingByCategory = useMemo(
    () =>
      Object.fromEntries(
        routing.map((rule) => [rule.category, rule.provider] as const),
      ) as Partial<Record<FileCategory, FileHostProviderId>>,
    [routing],
  );

  const save = async () => {
    await saveFileHostConfig({
      enabled,
      allowClipboardImages,
      maxSize: Math.max(1, Number(maxSizeMb || '10')) * 1024 * 1024,
      routing: categories.map((category) => ({
        category: category.id,
        provider: routingByCategory[category.id] ?? 'local-files',
      })),
      extensionOverrides: parseOverrideLines(overridesText),
      providers: {
        mltServer: {
          endpoint: mltEndpoint,
          authMode: mltAuthMode,
          token: mltToken,
          username: mltUsername,
          password: mltPassword,
        },
        webdav: {
          endpoint: webdavEndpoint,
          publicBaseUrl: webdavPublicBaseUrl,
          username: webdavUsername,
          password: webdavPassword,
          directory: webdavDirectory,
        },
      },
    });

    if (isAdmin && !isNativeClient()) {
      await Promise.all([
        putSetting('admin:file-host:enabled', String(serverEnabled)),
        putSetting('admin:file-host:max-size', String(Math.max(1, Number(serverMaxSizeMb || '10')) * 1024 * 1024)),
        putSetting('admin:file-host:public-base-url', serverPublicBaseUrl),
        putSetting('admin:allow-attachments', String(serverEnabled)),
        putSetting('admin:attachment-max-size', String(Math.max(1, Number(serverMaxSizeMb || '10')) * 1024 * 1024)),
        putSetting('admin:image-host-url', serverPublicBaseUrl),
      ]);
    }

    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  if (!ready) {
    return <p className="text-xs text-[var(--color-text-tertiary)]">{t('Loading...')}</p>;
  }

  return (
    <div className="space-y-5">
      <section
        className="rounded-2xl border p-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
          >
            <CloudUpload size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">
              {t('File host core')}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              {t(
                'Route images, documents, and other files through local storage, MLT Server, or WebDAV.',
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-start justify-between gap-4 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">{t('Enable file host')}</p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              {t('Turn clipboard, drag-and-drop, and file routing on or off.')}
            </p>
          </div>
          <Toggle checked={enabled} onChange={setEnabled} />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {t('Allow clipboard images')}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              {t('When disabled, paste falls back to plain text only.')}
            </p>
          </div>
          <Toggle checked={allowClipboardImages} onChange={setAllowClipboardImages} />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
            {t('Max upload size (MB)')}
          </label>
          <input
            type="number"
            min="1"
            value={maxSizeMb}
            onChange={(event) => setMaxSizeMb(event.target.value)}
            className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon size={15} className="text-[var(--color-accent)]" />
          <p className="text-sm font-semibold text-[var(--color-text)]">{t('Category routing')}</p>
        </div>
        {categories.map((category) => (
          <div key={category.id} className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              {category.label}
            </label>
            <select
              value={routingByCategory[category.id] ?? 'local-files'}
              onChange={(event) =>
                setRouting((prev) => [
                  ...prev.filter((rule) => rule.category !== category.id),
                  { category: category.id, provider: event.target.value as FileHostProviderId },
                ])
              }
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <FolderArchive size={15} className="text-[var(--color-accent)]" />
          <p className="text-sm font-semibold text-[var(--color-text)]">
            {t('Extension overrides')}
          </p>
        </div>
        <p className="text-[11px] text-[var(--color-text-tertiary)]">
          {t('One rule per line, for example:')} <code>heic=image</code> {t('or')}{' '}
          <code>md=document</code>
        </p>
        <textarea
          value={overridesText}
          onChange={(event) => setOverridesText(event.target.value)}
          rows={5}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
        />
      </section>

      <section className="space-y-3 rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="flex items-center gap-2">
          <Server size={15} className="text-[var(--color-accent)]" />
          <p className="text-sm font-semibold text-[var(--color-text)]">
            {t('MLT Server provider')}
          </p>
        </div>
        <input
          type="url"
          value={mltEndpoint}
          onChange={(event) => setMltEndpoint(event.target.value)}
          placeholder="https://your-server.example.com"
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
        />
        <select
          value={mltAuthMode}
          onChange={(event) => setMltAuthMode(event.target.value as 'session' | 'token' | 'credentials')}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
        >
          <option value="session">{t('Reuse current session')}</option>
          <option value="token">{t('Bearer token')}</option>
          <option value="credentials">{t('Username and password')}</option>
        </select>
        {mltAuthMode === 'token' ? (
          <input
            type="password"
            value={mltToken}
            onChange={(event) => setMltToken(event.target.value)}
            placeholder={t('Bearer token')}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
          />
        ) : null}
        {mltAuthMode === 'credentials' ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={mltUsername}
              onChange={(event) => setMltUsername(event.target.value)}
              placeholder={t('Username')}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
            />
            <input
              type="password"
              value={mltPassword}
              onChange={(event) => setMltPassword(event.target.value)}
              placeholder={t('Password')}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
            />
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="flex items-center gap-2">
          <Link2 size={15} className="text-[var(--color-accent)]" />
          <p className="text-sm font-semibold text-[var(--color-text)]">{t('WebDAV provider')}</p>
        </div>
        <input
          type="url"
          value={webdavEndpoint}
          onChange={(event) => setWebdavEndpoint(event.target.value)}
          placeholder="https://dav.example.com/root"
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
        />
        <input
          type="url"
          value={webdavPublicBaseUrl}
          onChange={(event) => setWebdavPublicBaseUrl(event.target.value)}
          placeholder="https://cdn.example.com/files"
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            type="text"
            value={webdavUsername}
            onChange={(event) => setWebdavUsername(event.target.value)}
            placeholder={t('Username')}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
          />
          <input
            type="password"
            value={webdavPassword}
            onChange={(event) => setWebdavPassword(event.target.value)}
            placeholder={t('Password')}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
          />
          <input
            type="text"
            value={webdavDirectory}
            onChange={(event) => setWebdavDirectory(event.target.value)}
            placeholder="uploads"
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
          />
        </div>
      </section>

      {isAdmin && !isNativeClient() && (
        <section className="space-y-3 rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2">
            <Settings2 size={15} className="text-[var(--color-accent)]" />
            <p className="text-sm font-semibold text-[var(--color-text)]">{t('Server file host')}</p>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">
                {t('Enable server uploads')}
              </p>
              <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                {t('Lets this hosted server act as a managed file host for signed-in users.')}
              </p>
            </div>
            <Toggle checked={serverEnabled} onChange={setServerEnabled} />
          </div>
          <input
            type="number"
            min="1"
            value={serverMaxSizeMb}
            onChange={(event) => setServerMaxSizeMb(event.target.value)}
            placeholder="10"
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
          />
          <input
            type="url"
            value={serverPublicBaseUrl}
            onChange={(event) => setServerPublicBaseUrl(event.target.value)}
            placeholder={t('Public base url for generated links (optional)')}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
          />
        </section>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          {saved ? t('Saved') : t('Save')}
        </button>
        <span className="text-[11px] text-[var(--color-text-tertiary)]">
          {saved ? t('File host settings saved.') : t('Changes apply immediately for new uploads.')}
        </span>
      </div>
    </div>
  );
}
