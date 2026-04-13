import {
  ChevronRight,
  Download,
  FolderInput,
  Loader2,
  Package,
  Puzzle,
  RefreshCw,
  Search,
  Store,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getRegistrySources,
  mergeAllRegistryPlugins,
  setRegistrySources,
} from '../plugins/pluginRegistry';
import { usePluginStore } from '../plugins/pluginStore';
import { DEFAULT_REGISTRY_URL, type RegistryPluginEntry } from '../plugins/types';
import { useToastStore } from '../stores/toastStore';

function MarketplaceEntryRow({
  entry,
  installedVersion,
  installingId,
  onInstall,
  t,
}: {
  entry: RegistryPluginEntry;
  installedVersion: string | undefined;
  installingId: string | null;
  onInstall: () => Promise<void>;
  t: (k: string) => string;
}) {
  const upToDate = installedVersion !== undefined && installedVersion === entry.version;
  const label =
    installedVersion !== undefined && !upToDate
      ? t('Update')
      : installedVersion !== undefined
        ? t('Installed')
        : t('Install');

  return (
    <li
      className="rounded-xl border border-[var(--color-border)] p-3 sm:p-3.5"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--color-text)]">{entry.name}</p>
          {entry.description ? (
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-secondary)] line-clamp-3">
              {entry.description}
            </p>
          ) : null}
          <p className="mt-2 text-[10px] text-[var(--color-text-tertiary)]">
            <span className="font-mono">{entry.id}</span>
            <span className="mx-1.5 opacity-50">·</span>v{entry.version}
            {entry.homepage ? (
              <>
                <span className="mx-1.5 opacity-50">·</span>
                <a
                  href={entry.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-accent)] underline-offset-2 hover:underline"
                >
                  {t('Homepage')}
                </a>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          disabled={!!installingId || (!!installedVersion && upToDate)}
          onClick={() => void onInstall()}
          className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium disabled:opacity-50 sm:w-auto sm:min-w-[5.5rem]"
          style={{
            background: 'var(--color-accent-soft)',
            color: 'var(--color-accent)',
          }}
        >
          {installingId === entry.id ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Download size={12} />
          )}
          {label}
        </button>
      </div>
    </li>
  );
}

function SectionCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-[var(--color-border)] p-4 sm:p-5 ${className}`}
      style={{ background: 'var(--color-surface)' }}
    >
      {children}
    </section>
  );
}

export function ThirdPartyPluginsPanel() {
  const { t } = useTranslation('settings');
  const showToast = useToastStore((s) => s.showToast);
  const plugins = usePluginStore((s) => s.plugins);
  const hydrated = usePluginStore((s) => s.hydrated);
  const installFromArrayBuffer = usePluginStore((s) => s.installFromArrayBuffer);
  const installFromUrl = usePluginStore((s) => s.installFromUrl);
  const enable = usePluginStore((s) => s.enable);
  const disable = usePluginStore((s) => s.disable);
  const uninstall = usePluginStore((s) => s.uninstall);
  const devMode = usePluginStore((s) => s.devMode);
  const setDevMode = usePluginStore((s) => s.setDevMode);
  const hydrate = usePluginStore((s) => s.hydrate);

  const [market, setMarket] = useState<Awaited<ReturnType<typeof mergeAllRegistryPlugins>>>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketQuery, setMarketQuery] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [sourcesText, setSourcesText] = useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const searchId = useId();
  const registryTextareaId = useId();

  useEffect(() => {
    void getRegistrySources().then((urls) => setSourcesText(urls.join('\n')));
  }, []);

  const loadMarket = useCallback(async () => {
    setMarketLoading(true);
    try {
      const list = await mergeAllRegistryPlugins();
      setMarket(list);
    } catch (e) {
      showToast({
        type: 'error',
        message: e instanceof Error ? e.message : String(e),
        duration: 4000,
      });
    } finally {
      setMarketLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadMarket();
  }, [loadMarket]);

  const filtered = market.filter((p) => {
    const q = marketQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.description?.toLowerCase().includes(q) ?? false)
    );
  });

  const installedCount = Object.keys(plugins).length;

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      await installFromArrayBuffer(buf, { source: 'file' });
      showToast({ type: 'success', message: t('Plugin installed'), duration: 3000 });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
        duration: 5000,
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 1 — 已安装（主视角） */}
      <SectionCard>
        <div className="flex flex-wrap items-start justify-between gap-3 gap-y-2 border-b border-[var(--color-border)] pb-3 mb-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
              aria-hidden
            >
              <Puzzle size={16} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-[var(--color-text)] tracking-tight">
                {t('Plugins section installed')}
                {hydrated && installedCount > 0 ? (
                  <span
                    className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                    style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
                  >
                    {installedCount}
                  </span>
                ) : null}
              </h3>
              <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)] leading-snug">
                {t('Plugins section installed subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void hydrate()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-bg)]"
          >
            <RefreshCw size={12} />
            {t('Refresh')}
          </button>
        </div>

        {!hydrated ? (
          <div className="flex items-center gap-2 py-6 text-xs text-[var(--color-text-tertiary)]">
            <Loader2 size={14} className="animate-spin shrink-0" />
            {t('Loading...')}
          </div>
        ) : installedCount === 0 ? (
          <div
            className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-8 text-center"
            style={{ background: 'var(--color-bg)' }}
          >
            <Package
              className="mx-auto mb-2 opacity-40"
              size={28}
              style={{ color: 'var(--color-text-tertiary)' }}
            />
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">
              {t('No third-party plugins')}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)] max-w-sm mx-auto leading-relaxed">
              {t('Plugins installed empty hint')}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {Object.values(plugins).map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2.5 sm:px-4"
                style={{ background: 'var(--color-bg)' }}
              >
                <Package
                  size={16}
                  className="shrink-0 text-[var(--color-text-tertiary)]"
                  aria-hidden
                />
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-sm font-medium text-[var(--color-text)] truncate">
                    {p.manifest.name}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)]">
                    <span className="font-mono text-[10px]">{p.id}</span>
                    <span className="mx-1.5 opacity-50">·</span>
                    <span>v{p.manifest.version}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => void (p.enabled ? disable(p.id) : enable(p.id))}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      p.enabled
                        ? 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]'
                        : 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    }`}
                  >
                    {p.enabled ? t('Disable') : t('Enable')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void uninstall(p.id)}
                    className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-secondary)]"
                    aria-label={t('Uninstall')}
                    title={t('Uninstall')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 2 — 市场 */}
      <SectionCard>
        <div className="flex flex-wrap items-start justify-between gap-3 gap-y-2 border-b border-[var(--color-border)] pb-3 mb-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
              aria-hidden
            >
              <Store size={16} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-[var(--color-text)] tracking-tight">
                {t('Plugins section marketplace')}
              </h3>
              <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)] leading-snug">
                {t('Plugins section marketplace subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={marketLoading}
            onClick={() => void loadMarket()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-bg)] disabled:opacity-50"
          >
            {marketLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            {t('Refresh')}
          </button>
        </div>

        <div className="relative mb-3">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
            aria-hidden
          />
          <input
            id={searchId}
            value={marketQuery}
            onChange={(e) => setMarketQuery(e.target.value)}
            placeholder={t('Search plugins...')}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] py-2.5 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-[var(--color-accent)]/25"
            style={{ color: 'var(--color-text)' }}
          />
        </div>

        {marketLoading && filtered.length === 0 ? (
          <div className="flex items-center gap-2 py-8 text-xs text-[var(--color-text-tertiary)]">
            <Loader2 size={14} className="animate-spin shrink-0" />
            {t('Loading...')}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-[var(--color-text-tertiary)] leading-relaxed">
            {t('No marketplace entries')}
          </p>
        ) : (
          <ul className="max-h-[min(22rem,50vh)] space-y-2 overflow-y-auto pr-0.5">
            {filtered.map((p) => (
              <MarketplaceEntryRow
                key={p.id}
                entry={p}
                installedVersion={plugins[p.id]?.manifest.version}
                installingId={installingId}
                t={t}
                onInstall={async () => {
                  setInstallingId(p.id);
                  try {
                    await installFromUrl(p.downloadUrl);
                    showToast({ type: 'success', message: t('Plugin installed'), duration: 3000 });
                  } catch (err) {
                    showToast({
                      type: 'error',
                      message: err instanceof Error ? err.message : String(err),
                      duration: 5000,
                    });
                  } finally {
                    setInstallingId(null);
                  }
                }}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 3 — 本地安装 */}
      <SectionCard>
        <div className="flex flex-wrap items-start gap-2.5 mb-4">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
            aria-hidden
          >
            <FolderInput size={16} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-semibold text-[var(--color-text)] tracking-tight">
              {t('Plugins section local')}
            </h3>
            <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)] leading-snug">
              {t('Plugins section local subtitle')}
            </p>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".mltp,.zip,application/zip"
          className="hidden"
          onChange={onPickFile}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90 sm:w-auto sm:min-w-[12rem]"
          style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
        >
          <Upload size={16} />
          {t('Choose mltp file')}
        </button>
      </SectionCard>

      {/* 4 — 高级：注册表 + 开发模式 */}
      <details
        className="group rounded-2xl border border-[var(--color-border)]"
        style={{ background: 'var(--color-surface)' }}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3.5 text-[13px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <ChevronRight
              className="size-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform group-open:rotate-90"
              aria-hidden
            />
            {t('Plugins section advanced')}
          </span>
          <span className="text-[10px] font-normal uppercase tracking-wide text-[var(--color-text-tertiary)]">
            {t('Plugins advanced badge')}
          </span>
        </summary>
        <div className="space-y-5 border-t border-[var(--color-border)] px-4 py-4 sm:px-5 sm:py-5">
          <div>
            <label
              htmlFor={registryTextareaId}
              className="block text-[11px] font-medium text-[var(--color-text-secondary)]"
            >
              {t('Registry sources')}
            </label>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)] leading-relaxed">
              {t('Registry sources hint')}
            </p>
            <textarea
              id={registryTextareaId}
              value={sourcesText}
              onChange={(e) => setSourcesText(e.target.value)}
              rows={4}
              placeholder="https://..."
              className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 font-mono text-[11px] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/25"
              style={{ color: 'var(--color-text)' }}
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() =>
                void (async () => {
                  const urls = sourcesText
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  await setRegistrySources(urls.length > 0 ? urls : [DEFAULT_REGISTRY_URL]);
                  showToast({ type: 'success', message: t('Saved'), duration: 2000 });
                  await loadMarket();
                })()
              }
              className="mt-2 text-xs font-medium text-[var(--color-accent)]"
            >
              {t('Save registry sources')}
            </button>
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-3 sm:px-4"
            style={{ background: 'var(--color-bg)' }}
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--color-text)]">{t('Plugin dev mode')}</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)] leading-snug">
                {t('Plugin dev mode hint')}
              </p>
            </div>
            <button
              type="button"
              aria-label={t('Plugin dev mode')}
              aria-pressed={devMode}
              onClick={() => void setDevMode(!devMode)}
              className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${devMode ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'}`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${devMode ? 'translate-x-5' : 'translate-x-1'}`}
              />
            </button>
          </div>

          {devMode && (
            <button
              type="button"
              onClick={() => {
                window.location.reload();
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] sm:w-auto"
            >
              <RefreshCw size={14} />
              {t('Reload app to refresh plugins')}
            </button>
          )}
        </div>
      </details>
    </div>
  );
}
