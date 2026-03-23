import type React from 'react';
import { motion } from 'framer-motion';
import {
  CalendarClock,
  CheckCircle,
  Cloud,
  Command,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  HardDriveDownload,
  Info,
  Key,
  Loader2,
  Moon,
  RefreshCw,
  RotateCcw,
  Server,
  Upload,
  Wifi,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../locales';
import { ScheduleEditor } from '../components/ScheduleEditor';
import { getAuthToken } from '../stores/authStore';
import { getSetting, putSetting, deleteSetting, getSettingsApiBase } from '../storage/settingsApi';
import { useScheduleStore, useShortcutStore, useStreamStore, useTaskStore, useRoleStore } from '../stores';
import { useIsMobile } from '../utils/useIsMobile';
import { eventToKeyString } from '../utils/shortcuts';

type SettingsTab = 'general' | 'schedule' | 'shortcuts' | 'sync' | 'data' | 'about';

const TABS: { id: SettingsTab; label: string; icon: typeof Key }[] = [
  { id: 'general', label: 'General', icon: Moon },
  { id: 'schedule', label: 'Schedule', icon: CalendarClock },
  { id: 'shortcuts', label: 'Shortcuts', icon: Command },
  { id: 'sync', label: 'Sync', icon: Cloud },
  { id: 'data', label: 'Data', icon: FolderOpen },
  { id: 'about', label: 'About', icon: Info },
];

function ShortcutRow({
  label,
  keys,
  onRecord,
}: {
  label: string;
  keys: string;
  onRecord: (newKeys: string) => void;
}) {
  const { t } = useTranslation('settings');
  const [recording, setRecording] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!recording) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

      const newKeys = eventToKeyString(e);
      onRecord(newKeys);
      setRecording(false);
    };

    const cancel = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setRecording(false);
      }
    };

    window.addEventListener('keydown', handler, true);
    window.addEventListener('mousedown', cancel);
    return () => {
      window.removeEventListener('keydown', handler, true);
      window.removeEventListener('mousedown', cancel);
    };
  }, [recording, onRecord]);

  return (
    <div ref={rowRef} className="flex items-center justify-between py-1.5">
      <span className="text-[13px]" style={{ color: 'var(--color-text)' }}>
        {label}
      </span>
      <button
        type="button"
        onClick={() => setRecording(true)}
        className="rounded-lg px-2.5 py-1 text-xs font-mono transition-colors"
        style={{
          background: recording ? 'var(--color-accent-soft)' : 'var(--color-bg)',
          border: recording ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
          color: recording ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          minWidth: '80px',
          textAlign: 'center',
        }}
      >
        {recording ? t('Press a key...') : keys}
      </button>
    </div>
  );
}

/* ── Tab Content Panels ── */

function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }
  localStorage.setItem('mlt-theme', theme);
}

function GeneralTab() {
  const { t } = useTranslation('settings');
  const [apiKey, setApiKey] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('https://api.openai.com/v1');
  const [aiSaved, setAiSaved] = useState(false);
  const [theme, setTheme] = useState('system');

  const roleSettings = useRoleStore((s) => s.settings);
  const updateRoleSettings = useRoleStore((s) => s.updateSettings);

  useEffect(() => {
    getSetting('ai-api-key').then((v) => { if (v) setApiKey(v); });
    getSetting('ai-api-endpoint').then((v) => { if (v) setApiEndpoint(v); });
    getSetting('theme').then((v) => {
      const t = v || 'system';
      setTheme(t);
      applyTheme(t);
    });
  }, []);

  const handleSaveAi = async () => {
    await putSetting('ai-api-key', apiKey);
    await putSetting('ai-api-endpoint', apiEndpoint);
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2000);
  };

  const handleThemeChange = async (newTheme: string) => {
    setTheme(newTheme);
    applyTheme(newTheme);
    await putSetting('theme', newTheme);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* AI Configuration */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Key size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('AI Configuration')}</h3>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          {t('Enter an OpenAI-compatible API key for smart task extraction, recommendations, and more. The key is stored locally only.')}
        </p>
        <div className="flex gap-2 mb-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <ExternalLink size={14} className="text-[var(--color-text-tertiary)] shrink-0" />
          <input
            type="url"
            value={apiEndpoint}
            onChange={(e) => setApiEndpoint(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <p className="flex-1 text-xs text-[var(--color-text-tertiary)]">
            {t('Supports OpenAI-compatible API endpoints (e.g. Deepseek, local Ollama, etc.)')}
          </p>
          <button
            type="button"
            onClick={handleSaveAi}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              aiSaved
                ? 'bg-[var(--color-success)] text-white'
                : 'bg-[var(--color-accent)] text-white hover:scale-[1.02] active:scale-95'
            }`}
          >
            {aiSaved ? t('Saved') : t('Save')}
          </button>
        </div>
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* Theme */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Moon size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Appearance')}</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">{t('Theme')}</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {theme === 'system' ? t('Currently following system settings') : theme === 'dark' ? t('Dark mode') : t('Light mode')}
            </p>
          </div>
          <div className="flex gap-1 rounded-xl bg-[var(--color-bg)] p-1">
            {[
              { id: 'system', label: t('Follow System') },
              { id: 'light', label: t('Light') },
              { id: 'dark', label: t('Dark') },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleThemeChange(option.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  theme === option.id
                    ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* Language */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Globe size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Language')}</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">{t('Display language for the app interface')}</p>
          </div>
          <select
            value={i18n.language}
            onChange={(e) => {
              i18n.changeLanguage(e.target.value);
              localStorage.setItem('language', e.target.value);
            }}
            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] outline-none"
          >
            <option value="zh-CN">{t('Chinese (Simplified)')}</option>
            <option value="en">{t('English')}</option>
          </select>
        </div>
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* Role Settings */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Roles')}</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">{t('Max roles')}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">{t('Maximum number of roles allowed')}</p>
            </div>
            <input
              type="number"
              min={1}
              max={20}
              value={roleSettings.maxRoles}
              onChange={(e) => updateRoleSettings({ maxRoles: Number.parseInt(e.target.value) || 8 })}
              className="w-16 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-center text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">{t('Show task count on roles')}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">{t('Display active task count next to each role')}</p>
            </div>
            <ToggleSwitch
              checked={roleSettings.showCounts}
              onChange={(v) => updateRoleSettings({ showCounts: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">{t('Show welcome card on role switch')}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">{t('Show a brief overview when switching roles')}</p>
            </div>
            <ToggleSwitch
              checked={roleSettings.showLandingCard}
              onChange={(v) => updateRoleSettings({ showLandingCard: v })}
            />
          </div>
        </div>
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* Onboarding */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <RotateCcw size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Onboarding')}</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">{t('Startup Guide')}</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">{t('Review the onboarding guide and contextual tips')}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await deleteSetting('onboarding-completed');
              localStorage.removeItem('mlt-onboarding-completed');
              const tipKeys = ['stream-intro', 'now-intro', 'role-sidebar'];
              for (const k of tipKeys) {
                await deleteSetting(`onboarding-tip-${k}`);
              }
              window.location.reload();
            }}
            className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)]"
          >
            {t('Restart Onboarding')}
          </button>
        </div>
      </section>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function ShortcutsTab() {
  const { t } = useTranslation('settings');
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const updateShortcut = useShortcutStore((s) => s.updateShortcut);
  const resetToDefaults = useShortcutStore((s) => s.resetToDefaults);

  const globalShortcuts = shortcuts.filter((s) => s.scope === 'global');
  const editorShortcuts = shortcuts.filter((s) => s.scope === 'editor');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-tertiary)]">
          {t('Click on a shortcut area, then press a new key combination to customize.')}
        </p>
        <button
          type="button"
          onClick={resetToDefaults}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--color-bg)] shrink-0 ml-4"
          style={{ color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}
        >
          <RotateCcw size={11} />
          {t('Reset Defaults')}
        </button>
      </div>

      <div>
        <p
          className="text-[11px] font-semibold uppercase tracking-wider mb-2"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {t('Global')}
        </p>
        <div className="space-y-0.5">
          {globalShortcuts.map((s) => (
            <ShortcutRow
              key={s.id}
              label={s.label}
              keys={s.keys}
              onRecord={(keys) => updateShortcut(s.id, keys)}
            />
          ))}
        </div>
      </div>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      <div>
        <p
          className="text-[11px] font-semibold uppercase tracking-wider mb-2"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {t('Editor')}
        </p>
        <div className="space-y-0.5">
          {editorShortcuts.map((s) => (
            <ShortcutRow
              key={s.id}
              label={s.label}
              keys={s.keys}
              onRecord={(keys) => updateShortcut(s.id, keys)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const APP_VERSION = '0.1.0';

function DataTab() {
  const { t } = useTranslation('settings');
  const [storageInfo, setStorageInfo] = useState<{
    db_type?: string;
    data_dir?: string;
    auth_mode?: string;
  } | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');
  const [importIsError, setImportIsError] = useState(false);
  const [migrateTarget, setMigrateTarget] = useState('');
  const [migrateDir, setMigrateDir] = useState('');
  const [migrateDbUrl, setMigrateDbUrl] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState('');
  const [migrateIsError, setMigrateIsError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [autoExportPath, setAutoExportPath] = useState('');
  const [autoExportEnabled, setAutoExportEnabled] = useState(false);
  const [autoExportSaving, setAutoExportSaving] = useState(false);
  const [fullExporting, setFullExporting] = useState(false);
  const [fullExportResult, setFullExportResult] = useState('');
  const [fullExportIsError, setFullExportIsError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = getAuthToken();
        const h: HeadersInit = { 'Content-Type': 'application/json' };
        if (token) h.Authorization = `Bearer ${token}`;
        const apiBase = getSettingsApiBase();
        const res = await fetch(`${apiBase}/api/admin/storage`, { headers: h });
        if (res.ok) setStorageInfo(await res.json());
      } catch { /* not admin or not available */ }

      const savedPath = await getSetting('auto-export-path');
      if (savedPath) {
        setAutoExportPath(savedPath);
        setAutoExportEnabled(true);
      }
    })();
  }, []);

  const [isTauriDataTab, setIsTauriDataTab] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        await import('@tauri-apps/api/core');
        setIsTauriDataTab(true);
      } catch {
        setIsTauriDataTab(false);
      }
    })();
  }, []);

  const handleExport = async (format: 'json' | 'markdown', asZip = false) => {
    setExporting(format);
    try {
      const token = getAuthToken();
      const h: HeadersInit = {};
      if (token) h.Authorization = `Bearer ${token}`;
      const apiBase = getSettingsApiBase();
      const res = await fetch(`${apiBase}/api/export/${format}`, { headers: h });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const data = await res.json();

      const dateSuffix = new Date().toISOString().slice(0, 10);

      if (format === 'markdown' || asZip) {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();

        zip.file('_meta.json', JSON.stringify({
          version: APP_VERSION,
          exported_at: new Date().toISOString(),
          format,
        }, null, 2));

        if (format === 'json') {
          zip.file('export.json', JSON.stringify(data, null, 2));
        } else {
          const entries: { path: string; content: string }[] = Array.isArray(data) ? data : data.files || [];
          for (const entry of entries) {
            zip.file(entry.path, entry.content);
          }
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-little-todo-${format}-${dateSuffix}-v${APP_VERSION}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const withMeta = { ...data, _meta: { version: APP_VERSION, exported_at: new Date().toISOString() } };
        const blob = new Blob([JSON.stringify(withMeta, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-little-todo-export-${dateSuffix}-v${APP_VERSION}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(null);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult('');
    try {
      const token = getAuthToken();
      const h: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) h.Authorization = `Bearer ${token}`;
      const apiBase = getSettingsApiBase();

      let payload: { files: { path: string; content: string }[]; settings?: [string, string][] };

      if (file.name.endsWith('.zip')) {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        const files: { path: string; content: string }[] = [];

        const metaFile = zip.file('_meta.json');
        if (metaFile) {
          const metaText = await metaFile.async('text');
          try {
            const meta = JSON.parse(metaText);
            console.log('[Import] version:', meta.version, 'exported_at:', meta.exported_at);
          } catch { /* ignore */ }
        }

        const jsonFile = zip.file('export.json');
        if (jsonFile) {
          const jsonText = await jsonFile.async('text');
          payload = JSON.parse(jsonText);
        } else {
          for (const [name, entry] of Object.entries(zip.files)) {
            if (entry.dir || name === '_meta.json') continue;
            const content = await entry.async('text');
            files.push({ path: name, content });
          }
          payload = { files };
        }
      } else {
        const text = await file.text();
        payload = JSON.parse(text);
      }

      const res = await fetch(`${apiBase}/api/import/json`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg: string;
        try { msg = JSON.parse(text).error ?? text; } catch { msg = text || `HTTP ${res.status}`; }
        setImportIsError(true);
        setImportResult(t('Error: {{message}}', { message: msg }));
        return;
      }
      const result = await res.json();
      setImportIsError(false);
      setImportResult(t('Import succeeded: {{fileCount}} files, {{settingsCount}} settings', { fileCount: result.files_imported, settingsCount: result.settings_imported ?? 0 }));
      await Promise.all([
        useStreamStore.getState().load(),
        useTaskStore.getState().load(),
        useRoleStore.getState().load(),
        useScheduleStore.getState().load(),
        useShortcutStore.getState().load(),
      ]);
    } catch (err) {
      setImportIsError(true);
      setImportResult(t('Import failed: {{message}}', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleMigrate = async () => {
    if (!migrateTarget) return;
    setMigrating(true);
    setMigrateResult('');
    try {
      const token = getAuthToken();
      const h: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) h.Authorization = `Bearer ${token}`;
      const apiBase = getSettingsApiBase();
      const res = await fetch(`${apiBase}/api/admin/migrate`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          target_db_type: migrateTarget,
          target_data_dir: migrateDir || undefined,
          target_database_url: migrateDbUrl || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMigrateIsError(false);
        setMigrateResult(t('Migration succeeded: {{fileCount}} files, {{settingsCount}} settings. {{message}}', { fileCount: data.files_migrated, settingsCount: data.settings_migrated, message: data.message }));
      } else {
        setMigrateIsError(true);
        setMigrateResult(t('Error: {{message}}', { message: data.error }));
      }
    } catch (err) {
      setMigrateIsError(true);
      setMigrateResult(t('Migration failed: {{message}}', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setMigrating(false);
    }
  };

  const dbLabel: Record<string, string> = {
    sqlite: 'SQLite',
    postgres: 'PostgreSQL',
    mysql: 'MySQL',
    mongodb: 'MongoDB',
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Current storage info */}
      {storageInfo && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Current Storage')}</h3>
          </div>

          <div className="space-y-2">
            {storageInfo.data_dir && (
              <div>
                <p className="text-xs font-medium text-[var(--color-text-tertiary)] mb-1">{t('Data Directory')}</p>
                <p className="rounded-lg bg-[var(--color-bg)] px-3 py-2 text-xs font-mono text-[var(--color-text-secondary)] break-all border border-[var(--color-border)]">
                  {storageInfo.data_dir}
                </p>
              </div>
            )}
            <div className="flex gap-4 text-xs text-[var(--color-text-secondary)]">
              <span>{t('Backend Type')}: <strong>{dbLabel[storageInfo.db_type ?? ''] ?? storageInfo.db_type}</strong></span>
              <span>{t('Auth Mode')}: <strong>{storageInfo.auth_mode}</strong></span>
            </div>
          </div>
        </section>
      )}

      {storageInfo && <hr style={{ borderColor: 'var(--color-border)' }} />}

      {/* Export */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Download size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Export Data')}</h3>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          {t('Export all data to a local file for backup and transfer. Exported files include version info (v{{version}}).', { version: APP_VERSION })}
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleExport('json')}
            disabled={exporting !== null}
            className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:opacity-50"
          >
            {exporting === 'json' ? t('Exporting...') : t('Export JSON')}
          </button>
          {isTauriDataTab ? (
            <>
              <button
                type="button"
                onClick={async () => {
                  const dir = window.prompt(t('Select export folder'), 'C:\\Users\\me\\Documents\\my-little-todo-export');
                  if (!dir) return;
                  setExporting('markdown');
                  try {
                    const token = getAuthToken();
                    const h: HeadersInit = { 'Content-Type': 'application/json' };
                    if (token) h.Authorization = `Bearer ${token}`;
                    const res = await fetch(`${getSettingsApiBase()}/api/export/disk`, {
                      method: 'POST',
                      headers: h,
                      body: JSON.stringify({ path: dir }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setFullExportIsError(false);
                      setFullExportResult(t('Exported {{count}} files to folder', { count: data.files_exported }));
                    } else {
                      const text = await res.text();
                      let msg: string;
                      try { msg = JSON.parse(text).error ?? text; } catch { msg = text || `HTTP ${res.status}`; }
                      setFullExportIsError(true);
                      setFullExportResult(t('Export failed: {{message}}', { message: msg }));
                    }
                  } catch (err) {
                    setFullExportIsError(true);
                    setFullExportResult(t('Export failed: {{message}}', { message: err instanceof Error ? err.message : String(err) }));
                  } finally {
                    setExporting(null);
                  }
                }}
                disabled={exporting !== null}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5">
                  <FolderOpen size={14} />
                  {exporting === 'markdown' ? t('Exporting...') : t('Export Markdown (Folder)')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleExport('markdown', true)}
                disabled={exporting !== null}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:opacity-50"
              >
                {exporting === 'markdown' ? t('Exporting...') : t('Export Markdown (ZIP)')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => handleExport('markdown', true)}
              disabled={exporting !== null}
              className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:opacity-50"
            >
              {exporting === 'markdown' ? t('Exporting...') : t('Export Markdown (ZIP)')}
            </button>
          )}
        </div>
        {fullExportResult && (
          <p className={`text-xs rounded-lg p-3 mt-3 ${
            fullExportIsError
              ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
              : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
          }`}>
            {fullExportResult}
          </p>
        )}
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* Import */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Upload size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Import Data')}</h3>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          {t('Restore data from previously exported files. Supports JSON files and Markdown ZIP packages.')}
        </p>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.zip"
            onChange={handleImport}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:opacity-50"
          >
            {importing ? (
              <><Loader2 size={14} className="animate-spin" /> {t('Importing...')}</>
            ) : (
              <><Upload size={14} /> {t('Select File (JSON / ZIP)')}</>
            )}
          </button>
        </div>
        {importResult && (
          <p className={`mt-3 text-xs rounded-lg p-3 ${
            importIsError
              ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
              : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
          }`}>
            {importResult}
          </p>
        )}
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* Migration */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-text)] mb-1">{t('Data Migration')}</h3>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          {t('Copy data from the current storage backend to another. Migration does not auto-switch; you need to update the config file (config.toml / .env) and restart.')}
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">{t('Target Backend')}</label>
            <select
              value={migrateTarget}
              onChange={(e) => setMigrateTarget(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
            >
              <option value="">{t('Select target type...')}</option>
              <option value="sqlite">SQLite</option>
              <option value="postgres">PostgreSQL</option>
              <option value="mysql">MySQL</option>
            </select>
          </div>

          {migrateTarget && (
            <>
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
                  {t('Target data directory (optional, leave empty to use current)')}
                </label>
                <input
                  type="text"
                  value={migrateDir}
                  onChange={(e) => setMigrateDir(e.target.value)}
                  placeholder="./data-new"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
                />
              </div>

              {(migrateTarget === 'postgres' || migrateTarget === 'mysql') && (
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
                    {t('Database Connection URL')}
                  </label>
                  <input
                    type="text"
                    value={migrateDbUrl}
                    onChange={(e) => setMigrateDbUrl(e.target.value)}
                    placeholder="postgres://user:pass@localhost/mlt"
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handleMigrate}
                disabled={migrating}
                className="rounded-xl px-4 py-2 text-sm font-medium transition-all bg-[var(--color-accent)] text-white hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                {migrating ? t('Migrating...') : t('Start Migration')}
              </button>
            </>
          )}

          {migrateResult && (
            <p className={`text-xs rounded-lg p-3 ${
              migrateIsError
                ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
            }`}>
              {migrateResult}
            </p>
          )}
        </div>
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* Continuous export */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <RefreshCw size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Continuous Export')}</h3>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          {t('When enabled, each file save automatically syncs a copy to the specified local directory. The database remains the primary data source; this directory is a read-only mirror.')}
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t('Enable Continuous Export')}</span>
            <button
              type="button"
              onClick={async () => {
                if (autoExportEnabled) {
                  setAutoExportSaving(true);
                  await deleteSetting('auto-export-path');
                  setAutoExportEnabled(false);
                  setAutoExportPath('');
                  setAutoExportSaving(false);
                } else {
                  setAutoExportEnabled(true);
                }
              }}
              className="relative h-6 w-11 rounded-full transition-colors shrink-0"
              style={{
                background: autoExportEnabled ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              <motion.div
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
                animate={{ left: autoExportEnabled ? '22px' : '2px' }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              />
            </button>
          </div>

          {autoExportEnabled && (
            <>
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
                  {t('Export Directory')}
                </label>
                <input
                  type="text"
                  value={autoExportPath}
                  onChange={(e) => setAutoExportPath(e.target.value)}
                  placeholder="C:\Users\me\Documents\my-little-todo-export"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors font-mono"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!autoExportPath || autoExportSaving}
                  onClick={async () => {
                    setAutoExportSaving(true);
                    await putSetting('auto-export-path', autoExportPath);
                    setAutoExportSaving(false);
                  }}
                  className="rounded-xl px-4 py-2 text-sm font-medium transition-all bg-[var(--color-accent)] text-white hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                >
                  {autoExportSaving ? t('Saving...') : t('Save Path')}
                </button>

                <button
                  type="button"
                  disabled={!autoExportPath || fullExporting}
                  onClick={async () => {
                    setFullExporting(true);
                    setFullExportResult('');
                    try {
                      const token = getAuthToken();
                      const h: HeadersInit = { 'Content-Type': 'application/json' };
                      if (token) h.Authorization = `Bearer ${token}`;
                      const res = await fetch(`${getSettingsApiBase()}/api/export/disk`, {
                        method: 'POST',
                        headers: h,
                        body: JSON.stringify({ path: autoExportPath }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        setFullExportIsError(false);
                        setFullExportResult(t('Full export complete: {{fileCount}} files', { fileCount: data.files_exported }));
                      } else {
                        setFullExportIsError(true);
                        setFullExportResult(t('Error: {{message}}', { message: data.error }));
                      }
                    } catch (err) {
                      setFullExportIsError(true);
                      setFullExportResult(t('Export failed: {{message}}', { message: err instanceof Error ? err.message : String(err) }));
                    } finally {
                      setFullExporting(false);
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:opacity-50"
                >
                  <HardDriveDownload size={14} />
                  {fullExporting ? t('Exporting...') : t('Full Export Now')}
                </button>
              </div>

              {fullExportResult && (
                <p className={`text-xs rounded-lg p-3 ${
                  fullExportIsError
                    ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                }`}>
                  {fullExportResult}
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function SyncTab() {
  const { t } = useTranslation('settings');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [isTauriEnv, setIsTauriEnv] = useState(false);
  const [serverRunning, setServerRunning] = useState(false);
  const [serverHost, setServerHost] = useState('127.0.0.1');
  const [serverPort, setServerPort] = useState(3001);
  const [pendingHost, setPendingHost] = useState('127.0.0.1');
  const [pendingPort, setPendingPort] = useState(3001);
  const [restarting, setRestarting] = useState(false);
  const [restartMsg, setRestartMsg] = useState('');
  const [restartIsError, setRestartIsError] = useState(false);

  const [useMode, setUseMode] = useState<'local' | 'cloud'>(() =>
    (localStorage.getItem('mlt-use-mode') as 'local' | 'cloud') || 'local',
  );
  const [cloudUrl, setCloudUrl] = useState(() => localStorage.getItem('mlt-cloud-url') || '');
  const [modeSaved, setModeSaved] = useState(false);

  const isLanSharing = serverHost === '0.0.0.0';

  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const cfg = await invoke<{
          port: number;
          host: string;
          auth_mode: string;
          running: boolean;
        }>('get_server_config');
        setServerRunning(cfg.running);
        setServerHost(cfg.host);
        setServerPort(cfg.port);
        setPendingHost(cfg.host);
        setPendingPort(cfg.port);
        setIsTauriEnv(true);
      } catch {
        setIsTauriEnv(false);
      }
    })();
  }, []);

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMsg('');
    try {
      const res = await fetch(`${getSettingsApiBase()}/health`);
      if (res.ok) {
        const data = await res.json();
        setTestStatus('success');
        setTestMsg(t('Connection successful — {{details}}', { details: `${data.db ?? ''} ${data.auth ?? ''}` }));
      } else {
        setTestStatus('error');
        setTestMsg(`HTTP ${res.status}`);
      }
    } catch (err) {
      setTestStatus('error');
      setTestMsg(err instanceof Error ? err.message : t('Connection failed'));
    }
  };

  const handleRestart = async () => {
    if (!isTauriEnv) return;
    setRestarting(true);
    setRestartMsg('');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      try { await invoke('stop_embedded_server'); } catch { /* might not be running */ }
      await new Promise((r) => setTimeout(r, 300));
      const url = await invoke<string>('start_embedded_server', {
        port: pendingPort,
        host: pendingHost,
      });
      setServerHost(pendingHost);
      setServerPort(pendingPort);
      setServerRunning(true);
      setRestartIsError(false);
      setRestartMsg(t('Server restarted at {{url}}', { url }));
    } catch (err) {
      setRestartIsError(true);
      setRestartMsg(t('Restart failed: {{message}}', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setRestarting(false);
    }
  };

  const hasChanges = pendingHost !== serverHost || pendingPort !== serverPort;

  return (
    <div className="flex flex-col gap-6">
      {/* Usage mode selector — Tauri only */}
      {isTauriEnv && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Server size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Usage Mode')}</h3>
          </div>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setUseMode('local')}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-medium transition-all border"
              style={{
                background: useMode === 'local' ? 'var(--color-accent)' : 'var(--color-surface)',
                color: useMode === 'local' ? 'white' : 'var(--color-text-secondary)',
                borderColor: useMode === 'local' ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {t('Local mode')}
            </button>
            <button
              type="button"
              onClick={() => setUseMode('cloud')}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-medium transition-all border"
              style={{
                background: useMode === 'cloud' ? 'var(--color-accent)' : 'var(--color-surface)',
                color: useMode === 'cloud' ? 'white' : 'var(--color-text-secondary)',
                borderColor: useMode === 'cloud' ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {t('Connect to cloud')}
            </button>
          </div>
          {useMode === 'cloud' && (
            <input
              type="url"
              value={cloudUrl}
              onChange={(e) => setCloudUrl(e.target.value)}
              placeholder="https://your-server.com"
              className="w-full rounded-xl px-3 py-2 text-xs outline-none transition-colors border mb-3"
              style={{
                background: 'var(--color-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('mlt-use-mode', useMode);
                if (useMode === 'cloud' && cloudUrl) {
                  localStorage.setItem('mlt-cloud-url', cloudUrl);
                } else {
                  localStorage.removeItem('mlt-cloud-url');
                }
                setModeSaved(true);
                setTimeout(() => setModeSaved(false), 3000);
              }}
              className="rounded-xl border px-4 py-2 text-xs font-medium transition-colors"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {t('Save')}
            </button>
            {modeSaved && (
              <span className="text-xs text-emerald-500 flex items-center gap-1">
                <CheckCircle size={12} />
                {t('Saved — restart the app to apply')}
              </span>
            )}
          </div>
          <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
            {useMode === 'local'
              ? t('Data stored locally, this PC acts as server')
              : t("Connect to remote server, don't start local backend")}
          </p>
        </section>
      )}

      {isTauriEnv && <hr style={{ borderColor: 'var(--color-border)' }} />}

      {/* Connection status */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Cloud size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Backend Connection')}</h3>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          {t('Data is read, written, and synced through the API server. The PC desktop version auto-starts an embedded server; the web version uses the current domain.')}
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${serverRunning ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            <span className="rounded-lg bg-[var(--color-bg)] px-3 py-2 text-xs font-mono text-[var(--color-text-secondary)] break-all border border-[var(--color-border)] flex-1">
              {getSettingsApiBase()}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={testStatus === 'testing'}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {testStatus === 'testing' && <Loader2 size={14} className="animate-spin" />}
              {testStatus === 'success' && <CheckCircle size={14} className="text-emerald-500" />}
              {testStatus === 'error' && <XCircle size={14} className="text-red-500" />}
              {t('Test Connection')}
            </button>
            {testMsg && (
              <span
                className="text-xs"
                style={{
                  color: testStatus === 'success' ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #ef4444)',
                }}
              >
                {testMsg}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Server config — only in Tauri PC mode */}
      {isTauriEnv && (
        <>
          <hr style={{ borderColor: 'var(--color-border)' }} />
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Server size={16} className="text-[var(--color-accent)]" />
              <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Embedded Server')}</h3>
            </div>

            <div className="space-y-4">
              {/* LAN sharing toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi size={15} style={{ color: 'var(--color-text-secondary)' }} />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">{t('Allow LAN Access')}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      {isLanSharing ? t('Other devices can connect via LAN') : t('Local access only')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingHost(pendingHost === '0.0.0.0' ? '127.0.0.1' : '0.0.0.0')}
                  className="relative h-6 w-11 rounded-full transition-colors shrink-0"
                  style={{
                    background: pendingHost === '0.0.0.0' ? 'var(--color-accent)' : 'var(--color-border)',
                  }}
                >
                  <motion.div
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
                    animate={{ left: pendingHost === '0.0.0.0' ? '22px' : '2px' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  />
                </button>
              </div>

              {/* Custom bind address (advanced) */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Globe size={15} style={{ color: 'var(--color-text-secondary)' }} />
                  <p className="text-xs font-medium text-[var(--color-text-secondary)]">{t('Listen Address and Port')}</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pendingHost}
                    onChange={(e) => setPendingHost(e.target.value)}
                    placeholder="127.0.0.1"
                    className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                  <input
                    type="number"
                    value={pendingPort}
                    onChange={(e) => setPendingPort(Number(e.target.value))}
                    className="w-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--color-text-tertiary)]">
                  {t('127.0.0.1 = local only · 0.0.0.0 = all interfaces · or specify a network interface IP')}
                </p>
              </div>

              {/* Apply button */}
              {hasChanges && (
                <button
                  type="button"
                  onClick={handleRestart}
                  disabled={restarting}
                  className="rounded-xl px-4 py-2 text-sm font-medium transition-all bg-[var(--color-accent)] text-white hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                >
                  {restarting ? t('Restarting...') : t('Apply and Restart Server')}
                </button>
              )}

              {restartMsg && (
                <p className={`text-xs rounded-lg p-3 ${
                  restartIsError
                    ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                }`}>
                  {restartMsg}
                </p>
              )}
            </div>
          </section>
        </>
      )}

      <hr style={{ borderColor: 'var(--color-border)' }} />

      <CloudBackupSection />
    </div>
  );
}

function CloudBackupSection() {
  const { t } = useTranslation('settings');
  const [provider, setProvider] = useState<'' | 's3' | 'webdav'>('');
  const [config, setConfig] = useState({
    endpoint: '',
    bucket: '',
    access_key: '',
    secret_key: '',
    region: '',
    username: '',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const token = getAuthToken();
        const h: HeadersInit = {};
        if (token) h.Authorization = `Bearer ${token}`;
        const res = await fetch(`${getSettingsApiBase()}/api/backup/config`, { headers: h });
        if (res.ok) {
          const data = await res.json();
          if (data.provider) setProvider(data.provider as '' | 's3' | 'webdav');
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const handleSave = async () => {
    if (!provider) return;
    setSaving(true);
    setStatus('');
    try {
      const token = getAuthToken();
      const h: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) h.Authorization = `Bearer ${token}`;
      const body: Record<string, string | undefined> = { provider };
      if (provider === 's3') {
        body.endpoint = config.endpoint;
        body.bucket = config.bucket;
        body.access_key = config.access_key;
        body.secret_key = config.secret_key;
        body.region = config.region || undefined;
      } else {
        body.endpoint = config.endpoint;
        body.username = config.username;
        body.password = config.password;
      }
      const res = await fetch(`${getSettingsApiBase()}/api/backup/config`, {
        method: 'PUT',
        headers: h,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setStatus(res.ok ? t('Configuration Saved') : t('Error: {{message}}', { message: data.error }));
    } catch (err) {
      setStatus(t('Save failed: {{message}}', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSaving(false);
    }
  };

  const handleBackup = async () => {
    setBackupRunning(true);
    setBackupStatus('');
    try {
      const token = getAuthToken();
      const h: HeadersInit = {};
      if (token) h.Authorization = `Bearer ${token}`;
      const res = await fetch(`${getSettingsApiBase()}/api/backup/run`, {
        method: 'POST',
        headers: h,
      });
      const data = await res.json();
      setBackupStatus(res.ok ? t('Backup Complete') : t('Error: {{message}}', { message: data.error }));
    } catch (err) {
      setBackupStatus(t('Backup failed: {{message}}', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBackupRunning(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors';
  const labelClass = 'text-xs font-medium text-[var(--color-text-secondary)] mb-1 block';

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Cloud size={16} className="text-[var(--color-accent)]" />
        <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Cloud Backup')}</h3>
      </div>
      <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
        {t('Back up data to S3-compatible object storage or a WebDAV server. This feature is under construction; some providers may not be fully available yet.')}
      </p>

      <div className="space-y-4">
        <div>
          <label className={labelClass}>{t('Backup Provider')}</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as '' | 's3' | 'webdav')}
            className={inputClass}
          >
            <option value="">{t('Not Configured')}</option>
            <option value="s3">{t('S3 Compatible Storage (AWS/MinIO/R2)')}</option>
            <option value="webdav">WebDAV</option>
          </select>
        </div>

        {provider === 's3' && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Endpoint URL</label>
              <input type="text" value={config.endpoint} onChange={(e) => setConfig({ ...config, endpoint: e.target.value })} placeholder="https://s3.amazonaws.com" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Bucket</label>
              <input type="text" value={config.bucket} onChange={(e) => setConfig({ ...config, bucket: e.target.value })} placeholder="my-todo-backup" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Access Key</label>
                <input type="password" value={config.access_key} onChange={(e) => setConfig({ ...config, access_key: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Secret Key</label>
                <input type="password" value={config.secret_key} onChange={(e) => setConfig({ ...config, secret_key: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>{t('Region (Optional)')}</label>
              <input type="text" value={config.region} onChange={(e) => setConfig({ ...config, region: e.target.value })} placeholder="us-east-1" className={inputClass} />
            </div>
          </div>
        )}

        {provider === 'webdav' && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>WebDAV URL</label>
              <input type="url" value={config.endpoint} onChange={(e) => setConfig({ ...config, endpoint: e.target.value })} placeholder="https://dav.example.com/backup/" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>{t('Username (Optional)')}</label>
                <input type="text" value={config.username} onChange={(e) => setConfig({ ...config, username: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t('Password (Optional)')}</label>
                <input type="password" value={config.password} onChange={(e) => setConfig({ ...config, password: e.target.value })} className={inputClass} />
              </div>
            </div>
          </div>
        )}

        {provider && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl px-4 py-2 text-sm font-medium text-white transition-all bg-[var(--color-accent)] hover:scale-[1.02] active:scale-95 disabled:opacity-50"
            >
              {saving ? t('Saving...') : t('Save Configuration')}
            </button>
            <button
              type="button"
              onClick={handleBackup}
              disabled={backupRunning}
              className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
            >
              {backupRunning ? t('Backing up...') : t('Backup Now')}
            </button>
          </div>
        )}

        {status && <p className="text-xs text-[var(--color-text-secondary)]">{status}</p>}
        {backupStatus && <p className="text-xs text-[var(--color-text-secondary)]">{backupStatus}</p>}
      </div>
    </section>
  );
}

function AboutTab() {
  const { t } = useTranslation('settings');
  return (
    <div className="flex flex-col gap-2 text-sm text-[var(--color-text-secondary)]">
      <p>
        My Little Todo <span className="text-[var(--color-text-tertiary)]">v0.1.0</span>
      </p>
      <p className="text-xs text-[var(--color-text-tertiary)]">
        {t('This is not a task manager — this is your external execution system.')}
      </p>
    </div>
  );
}

/* ── Shared Components ── */

function ScheduleTab() {
  const { load } = useScheduleStore();
  useEffect(() => { load(); }, [load]);
  return <ScheduleEditor />;
}

const TAB_CONTENT: Record<SettingsTab, () => React.JSX.Element> = {
  general: GeneralTab,
  schedule: ScheduleTab,
  shortcuts: ShortcutsTab,
  sync: SyncTab,
  data: DataTab,
  about: AboutTab,
};

/* ── Main Settings View ── */

export function SettingsView() {
  const { t } = useTranslation('settings');
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const ActiveContent = TAB_CONTENT[activeTab];
  const isMobile = useIsMobile();

  return (
    <div className={`flex h-full bg-[var(--color-bg)] ${isMobile ? 'flex-col' : ''}`}>
      {isMobile ? (
        <div
          className="flex items-center gap-0.5 px-2 pt-2 pb-1 overflow-x-auto shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors select-none outline-none"
                style={{
                  background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                }}
              >
                <Icon size={14} />
                {t(tab.label)}
              </button>
            );
          })}
        </div>
      ) : (
        <nav
          className="flex flex-col gap-1 py-8 px-3 shrink-0"
          style={{ width: '180px', borderRight: '1px solid var(--color-border)' }}
        >
          <h1 className="px-3 mb-4 text-lg font-bold" style={{ color: 'var(--color-text)' }}>
            {t('Settings')}
          </h1>

          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors text-left select-none outline-none"
                style={{
                  background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}
              >
                <Icon size={16} />
                {t(tab.label)}
              </button>
            );
          })}
        </nav>
      )}

      <div className={`flex-1 overflow-y-auto ${isMobile ? 'px-4 py-4' : 'py-8 px-8'}`}>
        <div className="max-w-xl">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
          >
            <h2 className="text-base font-bold mb-6" style={{ color: 'var(--color-text)' }}>
              {t(TABS.find((tab) => tab.id === activeTab)?.label ?? '')}
            </h2>
            <ActiveContent />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
