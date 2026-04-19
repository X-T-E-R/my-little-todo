import { Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModuleStore } from '../../modules/moduleStore';
import { isTauriEnv } from '../../utils/platform';
import { useEmbeddedHostStore } from './embeddedHostStore';

function ChoiceRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: readonly { id: T; label: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: value === option.id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
              color: value === option.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              border: `1px solid ${
                value === option.id ? 'var(--color-accent)' : 'var(--color-border)'
              }`,
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EmbeddedHostSettings() {
  const { t } = useTranslation('settings');
  const moduleEnabled = useModuleStore((s) => s.isEnabled('embedded-host'));
  const {
    hydrated,
    config,
    status,
    lastError,
    hydrate,
    saveConfig,
    startRuntime,
    stopRuntime,
    restartRuntime,
  } = useEmbeddedHostStore();
  const [host, setHost] = useState(config.host);
  const [port, setPort] = useState(String(config.port));
  const tauri = isTauriEnv();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    setHost(config.host);
    setPort(String(config.port));
  }, [config.host, config.port]);

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
            onBlur={() => void saveConfig({ host })}
            className="mt-2 w-full rounded-xl border px-3 py-2 text-xs outline-none transition-colors"
            style={{
              background: 'var(--color-bg)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
          <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
            {t('127.0.0.1 = local only · 0.0.0.0 = all interfaces · or specify a network interface IP')}
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
        </div>

        <ChoiceRow
          label={t('Embedded host auth')}
          value={config.authProvider}
          onChange={(next) => {
            void saveConfig({ authProvider: next });
          }}
          options={[
            { id: 'none', label: t('No Auth') },
            { id: 'embedded', label: t('Single User') },
          ]}
        />

        <ChoiceRow
          label={t('Embedded host signup policy')}
          value={config.signupPolicy}
          onChange={(next) => {
            void saveConfig({ signupPolicy: next });
          }}
          options={[
            { id: 'invite_only', label: t('Invite Only') },
            { id: 'open', label: t('Open Signup') },
            { id: 'admin_only', label: t('Admin Only') },
          ]}
        />

        {!hydrated && (
          <p className="text-[11px] text-[var(--color-text-tertiary)]">{t('Loading...')}</p>
        )}
      </section>
    </div>
  );
}
