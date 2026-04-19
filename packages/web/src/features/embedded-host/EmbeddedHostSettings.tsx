import { Server } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModuleStore } from '../../modules/moduleStore';
import { useToastStore } from '../../stores/toastStore';
import { isTauriEnv } from '../../utils/platform';
import {
  embeddedHostBaseUrl,
  isLoopbackHost,
} from './embeddedHostContract';
import {
  hasEmbeddedHostRuntimeConfigDrift,
  useEmbeddedHostStore,
} from './embeddedHostStore';

function InfoField({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div
      className="rounded-[var(--radius-card)] border px-4 py-3"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
      <p className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</p>
      <p className="mt-1 text-sm text-[var(--color-text)]">{value}</p>
      {description ? (
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function EmbeddedHostSettings() {
  const { t } = useTranslation('settings');
  const moduleEnabled = useModuleStore((s) => s.isEnabled('embedded-host'));
  const showToast = useToastStore((s) => s.showToast);
  const {
    hydrated,
    config,
    runtimeConfig,
    status,
    baseUrl,
    lastError,
    hydrate,
    saveConfig,
    startRuntime,
    stopRuntime,
    restartRuntime,
  } = useEmbeddedHostStore();
  const [host, setHost] = useState(config.host);
  const [port, setPort] = useState(String(config.port));
  const restartToastShownRef = useRef(false);
  const tauri = isTauriEnv();
  const runtimeConfigDrift = hasEmbeddedHostRuntimeConfigDrift(config, runtimeConfig, status);
  const currentBaseUrl =
    moduleEnabled && status === 'running'
      ? baseUrl ?? embeddedHostBaseUrl(runtimeConfig ?? config)
      : null;
  const savedBaseUrl = embeddedHostBaseUrl(config);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    setHost(config.host);
    setPort(String(config.port));
  }, [config.host, config.port]);

  useEffect(() => {
    if (!moduleEnabled || !runtimeConfigDrift) {
      restartToastShownRef.current = false;
      return;
    }
    if (restartToastShownRef.current) return;
    restartToastShownRef.current = true;
    showToast({
      type: 'info',
      message: t('Embedded host settings were saved. Restart the embedded host to apply them.'),
      action: {
        label: t('Restart Embedded Host'),
        onClick: () => {
          void restartRuntime();
        },
      },
      duration: 6000,
    });
  }, [moduleEnabled, restartRuntime, runtimeConfigDrift, showToast, t]);

  if (!tauri) {
    return (
      <p className="text-sm text-[var(--color-text-tertiary)]">{t('embedded_host_tauri_only')}</p>
    );
  }

  return (
    <div className="space-y-5 text-sm text-[var(--color-text)]">
      <section
        className="rounded-[var(--radius-panel)] border p-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="flex items-center gap-2">
          <Server size={16} className="text-[var(--color-accent)]" />
          <p className="text-sm font-semibold text-[var(--color-text)]">{t('Embedded Host')}</p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {t(
            'Optional local desktop API and MCP host. When disabled, no local port is exposed.',
          )}
        </p>
      </section>

      <section className="space-y-4">
        <div
          className="rounded-[var(--radius-card)] border px-4 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">{t('Status')}</p>
          <p className="mt-1 text-sm text-[var(--color-text)]">
            {moduleEnabled ? status : t('Embedded host module is disabled.')}
          </p>
          {lastError ? (
            <p className="mt-1 text-xs text-[var(--color-danger, #ef4444)]">{lastError}</p>
          ) : null}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <InfoField
              label={t('Current endpoint')}
              value={currentBaseUrl ?? t('Not running')}
              description={
                currentBaseUrl
                  ? t('Other desktop tools should call this address right now.')
                  : t('The embedded host is not exposing a local port right now.')
              }
            />
            <InfoField
              label={t('Saved endpoint')}
              value={savedBaseUrl}
              description={
                runtimeConfigDrift
                  ? t('Saved changes are waiting for restart.')
                  : t('Saved settings will be used the next time the embedded host starts.')
              }
            />
          </div>

          {runtimeConfigDrift ? (
            <div
              className="mt-3 rounded-[var(--radius-card)] border px-4 py-3"
              style={{
                borderColor: 'var(--color-warning, #f59e0b)',
                background: 'color-mix(in srgb, var(--color-warning, #f59e0b) 10%, var(--color-surface))',
              }}
            >
              <p className="text-xs font-semibold text-[var(--color-text)]">
                {t('Saved changes are waiting for restart.')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                {t('Restart the embedded host to apply the new address and mode.')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void restartRuntime()}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs font-medium"
                >
                  {t('Restart Embedded Host')}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!moduleEnabled || status === 'starting' || status === 'running'}
              onClick={() => void startRuntime()}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('Start Embedded Host')}
            </button>
            <button
              type="button"
              disabled={!moduleEnabled || status === 'inactive' || status === 'stopping'}
              onClick={() => void stopRuntime()}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('Stop Embedded Host')}
            </button>
            <button
              type="button"
              disabled={!moduleEnabled || status === 'inactive' || status === 'stopping'}
              onClick={() => void restartRuntime()}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('Restart Embedded Host')}
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('Host address')}
          </p>
          <input
            value={host}
            onChange={(event) => setHost(event.target.value)}
            onBlur={() => {
              const nextHost = host.trim() || config.host;
              if (!isLoopbackHost(nextHost)) {
                setHost(config.host);
                showToast({
                  type: 'error',
                  message: t('Desktop embedded host currently supports 127.0.0.1 or localhost only.'),
                });
                return;
              }
              void saveConfig({ host: nextHost });
            }}
            className="mt-2 w-full rounded-xl border px-3 py-2 text-xs outline-none transition-colors"
            style={{
              background: 'var(--color-bg)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
          <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
            {t('127.0.0.1 / localhost = local only. LAN exposure is not wired yet in this desktop build.')}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">{t('Port')}</p>
          <input
            value={port}
            onChange={(event) => setPort(event.target.value)}
            onBlur={() => {
              const next = Number(port);
              if (Number.isInteger(next) && next > 0) {
                void saveConfig({ port: next });
              } else {
                setPort(String(config.port));
              }
            }}
            className="mt-2 w-full rounded-xl border px-3 py-2 text-xs outline-none transition-colors"
            style={{
              background: 'var(--color-bg)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
          <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
            {t('Changing the port only takes effect after the embedded host restarts.')}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <InfoField label={t('Embedded host auth')} value={t('No Auth')} />
          <InfoField
            label={t('Embedded host signup policy')}
            value={t('Invite Only')}
            description={t('Signup policy is inactive while embedded auth is unavailable.')}
          />
        </div>

        <div
          className="rounded-[var(--radius-card)] border px-4 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('Desktop capability status')}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text)]">
            {t('Desktop embedded host currently supports 127.0.0.1 / localhost and No Auth only.')}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
            {t('LAN exposure, embedded auth, and signup policy are not wired yet in this desktop build.')}
          </p>
        </div>

        {!hydrated ? (
          <p className="text-[11px] text-[var(--color-text-tertiary)]">{t('Loading...')}</p>
        ) : null}
      </section>
    </div>
  );
}
