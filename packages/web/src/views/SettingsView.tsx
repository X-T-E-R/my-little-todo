import { motion } from 'framer-motion';
import {
  Activity,
  Bell,
  CalendarClock,
  CheckCircle,
  Cloud,
  Coffee,
  Command,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  HardDriveDownload,
  Info,
  Key,
  Loader2,
  LogOut,
  Moon,
  RefreshCw,
  RotateCcw,
  Server,
  Shield,
  Sparkles,
  Upload,
  User,
  XCircle,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScheduleEditor } from '../components/ScheduleEditor';
import i18n from '../locales';
import { getDataStore } from '../storage/dataStore';
import { deleteSetting, getSetting, getSettingsApiBase, putSetting } from '../storage/settingsApi';
import { getSyncEngine, initSyncFromConfig } from '../sync';
import type { ConflictStrategy } from '../sync';
import {
  useRoleStore,
  useScheduleStore,
  useShortcutStore,
  useStreamStore,
  useTaskStore,
} from '../stores';
import { getAuthToken, useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { checkGitHubUpdate } from '../utils/githubUpdater';
import {
  canEditBackendUrl,
  canExportToFolder,
  getPlatform,
  hasKeyboardShortcuts,
  isCapacitorEnv,
  isNativeClient,
  isTauriEnv,
} from '../utils/platform';
import { eventToKeyString } from '../utils/shortcuts';
import { useIsMobile } from '../utils/useIsMobile';

type SettingsTab =
  | 'general'
  | 'account'
  | 'ai'
  | 'schedule'
  | 'shortcuts'
  | 'sync'
  | 'data'
  | 'about';

const BASE_TABS: { id: SettingsTab; label: string; icon: typeof Key }[] = [
  { id: 'general', label: 'General', icon: Moon },
  { id: 'account', label: 'Account', icon: User },
  { id: 'ai', label: 'AI', icon: Sparkles },
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
  const [theme, setTheme] = useState('system');

  const roleSettings = useRoleStore((s) => s.settings);
  const updateRoleSettings = useRoleStore((s) => s.updateSettings);

  useEffect(() => {
    getSetting('theme').then((v) => {
      const t = v || 'system';
      setTheme(t);
      applyTheme(t);
    });
  }, []);

  const handleThemeChange = async (newTheme: string) => {
    setTheme(newTheme);
    applyTheme(newTheme);
    await putSetting('theme', newTheme);
  };

  return (
    <div className="flex flex-col gap-6">
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
              {theme === 'system'
                ? t('Currently following system settings')
                : theme === 'dark'
                  ? t('Dark mode')
                  : t('Light mode')}
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
            <p className="text-sm font-medium text-[var(--color-text)]">
              {t('Display language for the app interface')}
            </p>
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
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {t('Maximum number of roles allowed')}
              </p>
            </div>
            <input
              type="number"
              min={1}
              max={20}
              value={roleSettings.maxRoles}
              onChange={(e) =>
                updateRoleSettings({ maxRoles: Number.parseInt(e.target.value) || 8 })
              }
              className="w-16 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-center text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">
                {t('Show task count on roles')}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {t('Display active task count next to each role')}
              </p>
            </div>
            <ToggleSwitch
              checked={roleSettings.showCounts}
              onChange={(v) => updateRoleSettings({ showCounts: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">
                {t('Show welcome card on role switch')}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {t('Show a brief overview when switching roles')}
              </p>
            </div>
            <ToggleSwitch
              checked={roleSettings.showLandingCard}
              onChange={(v) => updateRoleSettings({ showLandingCard: v })}
            />
          </div>
        </div>
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* Notifications */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Bell size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Notifications')}</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">{t('Task Reminders')}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {t('Get notified when deadlines are approaching')}
              </p>
            </div>
            <NotificationToggle />
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
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {t('Review the onboarding guide and contextual tips')}
            </p>
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

function NotificationToggle() {
  const { t } = useTranslation('settings');
  const [enabled, setEnabled] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );

  useEffect(() => {
    getSetting('notification-enabled').then((v) => {
      if (v === 'false') setEnabled(false);
    });
  }, []);

  const handleToggle = async (v: boolean) => {
    setEnabled(v);
    await putSetting('notification-enabled', String(v));
    if (v && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      setPermission(perm);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {permission === 'denied' && (
        <span className="text-[10px] text-red-400">{t('Blocked by browser')}</span>
      )}
      {permission === 'default' && enabled && (
        <button
          type="button"
          onClick={async () => {
            const perm = await Notification.requestPermission();
            setPermission(perm);
          }}
          className="text-[10px] text-[var(--color-accent)] hover:underline"
        >
          {t('Grant permission')}
        </button>
      )}
      <ToggleSwitch checked={enabled} onChange={handleToggle} />
    </div>
  );
}

function AccountTab() {
  const { t } = useTranslation('settings');
  const user = useAuthStore((s) => s.user);
  const authMode = useAuthStore((s) => s.authMode);
  const logout = useAuthStore((s) => s.logout);
  const changePassword = useAuthStore((s) => s.changePassword);
  const showToast = useToastStore((s) => s.showToast);

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changing, setChanging] = useState(false);

  const handleChangePassword = async () => {
    if (!newPw || newPw !== confirmPw) {
      showToast({ type: 'error', message: t('Passwords do not match') });
      return;
    }
    if (newPw.length < 4) {
      showToast({ type: 'error', message: t('Password too short') });
      return;
    }
    setChanging(true);
    try {
      await changePassword(oldPw, newPw);
      showToast({ type: 'success', message: t('Password changed successfully') });
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      showToast({
        type: 'error',
        message: t('Change password failed: {{message}}', {
          message: err instanceof Error ? err.message : String(err),
        }),
      });
    } finally {
      setChanging(false);
    }
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* User Info */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <User size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('User Info')}</h3>
        </div>
        <div
          className="rounded-xl p-4 space-y-2"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-tertiary)]">{t('Username')}</span>
            <span className="text-sm font-medium text-[var(--color-text)]">
              {user?.username ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-tertiary)]">{t('Role')}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                user?.is_admin
                  ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]'
                  : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'
              }`}
            >
              {user?.is_admin ? t('Admin') : t('User')}
            </span>
          </div>
        </div>
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* Change Password */}
      {authMode !== 'none' && (
        <>
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Key size={16} className="text-[var(--color-accent)]" />
              <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Change Password')}</h3>
            </div>
            <div className="space-y-3">
              <input
                type="password"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
                placeholder={t('Current Password')}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
              />
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder={t('New Password')}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
              />
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder={t('Confirm New Password')}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
              />
              <button
                type="button"
                onClick={handleChangePassword}
                disabled={changing || !oldPw || !newPw || !confirmPw}
                className="rounded-xl px-4 py-2 text-sm font-medium transition-all bg-[var(--color-accent)] text-white hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                {changing ? t('Saving...') : t('Change Password')}
              </button>
            </div>
          </section>

          <hr style={{ borderColor: 'var(--color-border)' }} />
        </>
      )}

      {/* API Token */}
      {authMode !== 'none' && (
        <>
          <ApiTokenSection />
          <hr style={{ borderColor: 'var(--color-border)' }} />
        </>
      )}

      {/* Logout */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <LogOut size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Log Out')}</h3>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          {t('Log out will clear your local session. You can log in again anytime.')}
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <LogOut size={14} />
          {t('Log Out')}
        </button>
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

const APP_VERSION = __APP_VERSION__;

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
      if (!isNativeClient()) {
        try {
          const token = getAuthToken();
          const h: HeadersInit = { 'Content-Type': 'application/json' };
          if (token) h.Authorization = `Bearer ${token}`;
          const apiBase = getSettingsApiBase();
          const res = await fetch(`${apiBase}/api/admin/storage`, { headers: h });
          if (res.ok) setStorageInfo(await res.json());
        } catch {
          /* not admin or not available */
        }
      }

      const savedPath = await getSetting('auto-export-path');
      if (savedPath) {
        setAutoExportPath(savedPath);
        setAutoExportEnabled(true);
      }
    })();
  }, []);

  const isTauriDataTab = canExportToFolder();
  const showToast = useToastStore((s) => s.showToast);

  const collectLocalExportData = async () => {
    const store = getDataStore();
    const paths = await store.listFiles();
    const files: { path: string; content: string }[] = [];
    for (const p of paths) {
      const content = await store.readFile(p);
      if (content !== null) files.push({ path: p, content });
    }
    const allSettings = await store.getAllSettings();
    return { files, settings: Object.entries(allSettings) };
  };

  const handleExport = async (format: 'json' | 'markdown', asZip = false) => {
    setExporting(format);
    try {
      let data: unknown;

      if (isNativeClient()) {
        data = await collectLocalExportData();
      } else {
        const token = getAuthToken();
        const h: HeadersInit = {};
        if (token) h.Authorization = `Bearer ${token}`;
        const apiBase = getSettingsApiBase();
        const res = await fetch(`${apiBase}/api/export/${format}`, { headers: h });
        if (!res.ok) throw new Error(`Export failed: ${res.status}`);
        data = await res.json();
      }

      const dateSuffix = new Date().toISOString().slice(0, 10);

      if (format === 'markdown' || asZip) {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();

        zip.file(
          '_meta.json',
          JSON.stringify(
            {
              version: APP_VERSION,
              exported_at: new Date().toISOString(),
              format,
            },
            null,
            2,
          ),
        );

        if (format === 'json') {
          zip.file('export.json', JSON.stringify(data, null, 2));
        } else {
          const raw = data as { files?: { path: string; content: string }[] };
          const entries: { path: string; content: string }[] = Array.isArray(data)
            ? (data as { path: string; content: string }[])
            : raw.files || [];
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
        const withMeta = {
          ...(data as Record<string, unknown>),
          _meta: { version: APP_VERSION, exported_at: new Date().toISOString() },
        };
        const blob = new Blob([JSON.stringify(withMeta, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-little-todo-export-${dateSuffix}-v${APP_VERSION}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      showToast({ type: 'success', message: t('Export completed successfully') });
    } catch (err) {
      showToast({
        type: 'error',
        message: t('Export failed: {{message}}', {
          message: err instanceof Error ? err.message : String(err),
        }),
      });
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
          } catch {
            /* ignore */
          }
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

      if (isNativeClient()) {
        const store = getDataStore();
        let filesImported = 0;
        let settingsImported = 0;
        for (const f of payload.files) {
          await store.writeFile(f.content, f.path);
          filesImported++;
        }
        if (payload.settings) {
          for (const [key, value] of payload.settings) {
            await store.putSetting(key, value);
            settingsImported++;
          }
        }
        setImportIsError(false);
        setImportResult(
          t('Import succeeded: {{fileCount}} files, {{settingsCount}} settings', {
            fileCount: filesImported,
            settingsCount: settingsImported,
          }),
        );
      } else {
        const token = getAuthToken();
        const h: HeadersInit = { 'Content-Type': 'application/json' };
        if (token) h.Authorization = `Bearer ${token}`;
        const apiBase = getSettingsApiBase();
        const res = await fetch(`${apiBase}/api/import/json`, {
          method: 'POST',
          headers: h,
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const text = await res.text();
          let msg: string;
          try {
            msg = JSON.parse(text).error ?? text;
          } catch {
            msg = text || `HTTP ${res.status}`;
          }
          setImportIsError(true);
          setImportResult(t('Error: {{message}}', { message: msg }));
          return;
        }
        const result = await res.json();
        setImportIsError(false);
        setImportResult(
          t('Import succeeded: {{fileCount}} files, {{settingsCount}} settings', {
            fileCount: result.files_imported,
            settingsCount: result.settings_imported ?? 0,
          }),
        );
      }

      await Promise.all([
        useStreamStore.getState().load(),
        useTaskStore.getState().load(),
        useRoleStore.getState().load(),
        useScheduleStore.getState().load(),
        useShortcutStore.getState().load(),
      ]);
    } catch (err) {
      setImportIsError(true);
      setImportResult(
        t('Import failed: {{message}}', {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
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
        setMigrateResult(
          t('Migration succeeded: {{fileCount}} files, {{settingsCount}} settings. {{message}}', {
            fileCount: data.files_migrated,
            settingsCount: data.settings_migrated,
            message: data.message,
          }),
        );
      } else {
        setMigrateIsError(true);
        setMigrateResult(t('Error: {{message}}', { message: data.error }));
      }
    } catch (err) {
      setMigrateIsError(true);
      setMigrateResult(
        t('Migration failed: {{message}}', {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
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

  const native = isNativeClient();

  return (
    <div className="flex flex-col gap-6">
      {/* Server storage info */}
      {!native && storageInfo && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Current Storage')}</h3>
          </div>

          <div className="space-y-2">
            {storageInfo.data_dir && (
              <div>
                <p className="text-xs font-medium text-[var(--color-text-tertiary)] mb-1">
                  {t('Data Directory')}
                </p>
                <p className="rounded-lg bg-[var(--color-bg)] px-3 py-2 text-xs font-mono text-[var(--color-text-secondary)] break-all border border-[var(--color-border)]">
                  {storageInfo.data_dir}
                </p>
              </div>
            )}
            <div className="flex gap-4 text-xs text-[var(--color-text-secondary)]">
              <span>
                {t('Backend Type')}:{' '}
                <strong>{dbLabel[storageInfo.db_type ?? ''] ?? storageInfo.db_type}</strong>
              </span>
              <span>
                {t('Auth Mode')}: <strong>{storageInfo.auth_mode}</strong>
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Native local storage info */}
      {native && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <HardDriveDownload size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Current Storage')}</h3>
          </div>
          <div className="flex gap-4 text-xs text-[var(--color-text-secondary)]">
            <span>
              {t('Backend Type')}: <strong>SQLite</strong>
            </span>
            <span>
              {t('Auth Mode')}: <strong>none</strong>
            </span>
          </div>
        </section>
      )}

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* Export */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Download size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Export Data')}</h3>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          {t(
            'Export all data to a local file for backup and transfer. Exported files include version info (v{{version}}).',
            { version: APP_VERSION },
          )}
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
          {!native && isTauriDataTab && (
            <button
              type="button"
              onClick={async () => {
                const dir = window.prompt(
                  t('Select export folder'),
                  'C:\\Users\\me\\Documents\\my-little-todo-export',
                );
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
                    setFullExportResult(
                      t('Exported {{count}} files to folder', { count: data.files_exported }),
                    );
                  } else {
                    const text = await res.text();
                    let msg: string;
                    try {
                      msg = JSON.parse(text).error ?? text;
                    } catch {
                      msg = text || `HTTP ${res.status}`;
                    }
                    setFullExportIsError(true);
                    setFullExportResult(t('Export failed: {{message}}', { message: msg }));
                  }
                } catch (err) {
                  setFullExportIsError(true);
                  setFullExportResult(
                    t('Export failed: {{message}}', {
                      message: err instanceof Error ? err.message : String(err),
                    }),
                  );
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
          )}
          <button
            type="button"
            onClick={() => handleExport('markdown', true)}
            disabled={exporting !== null}
            className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:opacity-50"
          >
            {exporting === 'markdown' ? t('Exporting...') : t('Export Markdown (ZIP)')}
          </button>
        </div>
        {fullExportResult && (
          <p
            className={`text-xs rounded-lg p-3 mt-3 ${
              fullExportIsError
                ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
            }`}
          >
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
          {t(
            'Restore data from previously exported files. Supports JSON files and Markdown ZIP packages.',
          )}
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
              <>
                <Loader2 size={14} className="animate-spin" /> {t('Importing...')}
              </>
            ) : (
              <>
                <Upload size={14} /> {t('Select File (JSON / ZIP)')}
              </>
            )}
          </button>
        </div>
        {importResult && (
          <p
            className={`mt-3 text-xs rounded-lg p-3 ${
              importIsError
                ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
            }`}
          >
            {importResult}
          </p>
        )}
      </section>

      {!native && <hr style={{ borderColor: 'var(--color-border)' }} />}

      {/* Migration — server mode only */}
      {!native && <section>
        <h3 className="text-sm font-bold text-[var(--color-text)] mb-1">{t('Data Migration')}</h3>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          {t(
            'Copy data from the current storage backend to another. Migration does not auto-switch; you need to update the config file (config.toml / .env) and restart.',
          )}
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
              {t('Target Backend')}
            </label>
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
            <p
              className={`text-xs rounded-lg p-3 ${
                migrateIsError
                  ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                  : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
              }`}
            >
              {migrateResult}
            </p>
          )}
        </div>
      </section>}

      {!native && isTauriDataTab && <hr style={{ borderColor: 'var(--color-border)' }} />}

      {/* Continuous export — Tauri only, server mode */}
      {!native && isTauriDataTab && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Continuous Export')}</h3>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
            {t(
              'When enabled, each file save automatically syncs a copy to the specified local directory. The database remains the primary data source; this directory is a read-only mirror.',
            )}
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {t('Enable Continuous Export')}
              </span>
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
                          setFullExportResult(
                            t('Full export complete: {{fileCount}} files', {
                              fileCount: data.files_exported,
                            }),
                          );
                        } else {
                          setFullExportIsError(true);
                          setFullExportResult(t('Error: {{message}}', { message: data.error }));
                        }
                      } catch (err) {
                        setFullExportIsError(true);
                        setFullExportResult(
                          t('Export failed: {{message}}', {
                            message: err instanceof Error ? err.message : String(err),
                          }),
                        );
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
                  <p
                    className={`text-xs rounded-lg p-3 ${
                      fullExportIsError
                        ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                        : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                    }`}
                  >
                    {fullExportResult}
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function SyncTab() {
  const { t } = useTranslation('settings');
  const platform = getPlatform();
  const native = isNativeClient();

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [serverRunning, setServerRunning] = useState(false);
  const [cloudUrl, setCloudUrl] = useState(() => localStorage.getItem('mlt-cloud-url') || '');
  const [urlSaved, setUrlSaved] = useState(false);

  useEffect(() => {
    if (native) return;
    (async () => {
      try {
        const res = await fetch(`${getSettingsApiBase()}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) setServerRunning(true);
      } catch {
        /* server not reachable */
      }
    })();
  }, [native]);

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMsg('');
    try {
      const res = await fetch(`${getSettingsApiBase()}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        setTestStatus('success');
        setTestMsg(
          t('Connection successful — {{details}}', {
            details: `${data.db ?? ''} ${data.auth ?? ''}`,
          }),
        );
      } else {
        setTestStatus('error');
        setTestMsg(`HTTP ${res.status}`);
      }
    } catch (err) {
      setTestStatus('error');
      setTestMsg(err instanceof Error ? err.message : t('Connection failed'));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {native ? (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <HardDriveDownload size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Local Storage')}</h3>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
            {t('Data is stored locally in SQLite. Configure sync targets below to keep data in sync across devices.')}
          </p>
        </section>
      ) : (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Cloud size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Backend Connection')}</h3>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
            {platform === 'web-hosted'
              ? t('Hosted by the server — the backend address is fixed to the current domain.')
              : t('Data is stored and synced through the API server.')}
          </p>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${serverRunning ? 'bg-emerald-500' : 'bg-gray-400'}`}
              />
              <span className="rounded-lg bg-[var(--color-bg)] px-3 py-2 text-xs font-mono text-[var(--color-text-secondary)] break-all border border-[var(--color-border)] flex-1">
                {getSettingsApiBase() || window.location.origin}
              </span>
            </div>

            {canEditBackendUrl() && (
              <div className="flex flex-col gap-2">
                <input
                  type="url"
                  value={cloudUrl}
                  onChange={(e) => setCloudUrl(e.target.value)}
                  placeholder="https://your-server.com"
                  className="w-full rounded-xl px-3 py-2 text-xs outline-none transition-colors border"
                  style={{
                    background: 'var(--color-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.setItem('mlt-cloud-url', cloudUrl);
                      setUrlSaved(true);
                      setTimeout(() => setUrlSaved(false), 3000);
                    }}
                    className="rounded-xl border px-4 py-2 text-xs font-medium transition-colors"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {t('Save')}
                  </button>
                  {urlSaved && (
                    <span className="text-xs text-emerald-500 flex items-center gap-1">
                      <CheckCircle size={12} />
                      {t('Saved — restart the app to apply')}
                    </span>
                  )}
                </div>
              </div>
            )}

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
                    color:
                      testStatus === 'success'
                        ? 'var(--color-success, #22c55e)'
                        : 'var(--color-danger, #ef4444)',
                  }}
                >
                  {testMsg}
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      <hr style={{ borderColor: 'var(--color-border)' }} />
      <CloudSyncSection />
    </div>
  );
}

function ApiTokenSection() {
  const { t } = useTranslation('settings');
  const [duration, setDuration] = useState('31536000');
  const [generatedToken, setGeneratedToken] = useState('');
  const [generating, setGenerating] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const authToken = getAuthToken();
      const h: HeadersInit = { 'Content-Type': 'application/json' };
      if (authToken) h.Authorization = `Bearer ${authToken}`;
      const res = await fetch(`${getSettingsApiBase()}/api/auth/api-token`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ duration: Number(duration) || 0 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setGeneratedToken(data.token);
    } catch (err) {
      showToast({
        type: 'error',
        message: t('Error: {{message}}', {
          message: err instanceof Error ? err.message : String(err),
        }),
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedToken);
      showToast({ type: 'success', message: t('Copied!') });
    } catch {
      showToast({ type: 'error', message: t('Copy failed') });
    }
  };

  const inputClass =
    'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors';

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Key size={16} className="text-[var(--color-accent)]" />
        <h3 className="text-sm font-bold text-[var(--color-text)]">{t('API Token')}</h3>
      </div>
      <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
        {t('Generate a long-lived token for sync clients, MCP integrations, or API access.')}
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
            {t('Token Validity')}
          </label>
          <select value={duration} onChange={(e) => setDuration(e.target.value)} className={inputClass}>
            <option value="2592000">{t('30 days')}</option>
            <option value="7776000">{t('90 days')}</option>
            <option value="31536000">{t('1 year')}</option>
            <option value="0">{t('Never expires')}</option>
          </select>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-xl px-4 py-2 text-sm font-medium transition-all bg-[var(--color-accent)] text-white hover:scale-[1.02] active:scale-95 disabled:opacity-50"
        >
          {generating ? t('Saving...') : t('Generate Token')}
        </button>

        {generatedToken && (
          <div className="space-y-2">
            <textarea
              readOnly
              value={generatedToken}
              rows={3}
              className={`${inputClass} font-mono text-xs`}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)]"
            >
              <Copy size={12} />
              {t('Copy')}
            </button>
            <p className="text-[10px] text-[var(--color-text-tertiary)]">
              {t('Copy this token now. It will not be shown again.')}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function CloudSyncSection() {
  const { t } = useTranslation('settings');
  const native = isNativeClient();
  const [provider, setProvider] = useState<'' | 'api-server' | 's3' | 'webdav'>('');
  const [apiAuthMode, setApiAuthMode] = useState<'token' | 'credentials'>('credentials');
  const [config, setConfig] = useState({
    endpoint: '',
    token: '',
    bucket: '',
    access_key: '',
    secret_key: '',
    region: '',
    username: '',
    password: '',
  });
  const [syncInterval, setSyncInterval] = useState('300000');
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>('lww');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        if (native) {
          const store = getDataStore();
          const p = await store.getSetting('sync-provider');
          if (p) {
            setProvider(p as '' | 'api-server' | 's3' | 'webdav');
            const raw = await store.getSetting('sync-config');
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                setConfig((prev) => ({ ...prev, ...parsed }));
                if (parsed.auth_mode === 'token' || parsed.auth_mode === 'credentials') {
                  setApiAuthMode(parsed.auth_mode);
                }
              } catch { /* ignore */ }
            }
          }
          const iv = await store.getSetting('sync-interval');
          if (iv) setSyncInterval(iv);
          const cs = await store.getSetting('sync-conflict-strategy');
          if (cs === 'lww' || cs === 'manual') setConflictStrategy(cs);
        } else {
          const authToken = getAuthToken();
          const h: HeadersInit = {};
          if (authToken) h.Authorization = `Bearer ${authToken}`;
          const res = await fetch(`${getSettingsApiBase()}/api/backup/config`, { headers: h });
          if (res.ok) {
            const data = await res.json();
            if (data.provider) {
              setProvider(data.provider as '' | 'api-server' | 's3' | 'webdav');
              setConfig((prev) => ({
                ...prev,
                endpoint: data.endpoint ?? '',
                token: data.token ?? '',
                bucket: data.bucket ?? '',
                access_key: data.access_key ?? '',
                secret_key: data.secret_key ?? '',
                region: data.region ?? '',
                username: data.username ?? '',
                password: data.password ?? '',
              }));
            }
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, [native]);

  useEffect(() => {
    const engine = getSyncEngine();
    const unsub = engine.onStateChange((states) => {
      const allStates = Array.from(states.values());
      const latest = allStates.reduce((a, b) => (b.lastSyncAt > a.lastSyncAt ? b : a), allStates[0]);
      if (latest) setLastSyncAt(latest.lastSyncAt);
    });
    const states = engine.getAllStates();
    if (states.length > 0) {
      setLastSyncAt(Math.max(...states.map((s) => s.lastSyncAt)));
    }
    return unsub;
  }, []);

  const handleSave = async () => {
    if (!provider) return;
    setSaving(true);
    setStatus('');
    try {
      if (native) {
        const store = getDataStore();
        await store.putSetting('sync-provider', provider);
        const cfgToSave: Record<string, string> = {};
        if (provider === 'api-server') {
          cfgToSave.endpoint = config.endpoint;
          cfgToSave.auth_mode = apiAuthMode;
          if (apiAuthMode === 'token') {
            if (config.token) cfgToSave.token = config.token;
          } else {
            cfgToSave.username = config.username;
            cfgToSave.password = config.password;
          }
        } else if (provider === 's3') {
          cfgToSave.endpoint = config.endpoint;
          cfgToSave.bucket = config.bucket;
          cfgToSave.access_key = config.access_key;
          cfgToSave.secret_key = config.secret_key;
          if (config.region) cfgToSave.region = config.region;
        } else {
          cfgToSave.endpoint = config.endpoint;
          cfgToSave.username = config.username;
          cfgToSave.password = config.password;
        }
        await store.putSetting('sync-config', JSON.stringify(cfgToSave));
        await store.putSetting('sync-interval', syncInterval);
        await store.putSetting('sync-conflict-strategy', conflictStrategy);
        await initSyncFromConfig();
        setStatus(t('Configuration Saved'));
      } else {
        const authToken = getAuthToken();
        const h: HeadersInit = { 'Content-Type': 'application/json' };
        if (authToken) h.Authorization = `Bearer ${authToken}`;
        const body: Record<string, string | undefined> = { provider };
        if (provider === 'api-server') {
          body.endpoint = config.endpoint;
          body.auth_mode = apiAuthMode;
          if (apiAuthMode === 'token') {
            body.token = config.token || undefined;
          } else {
            body.username = config.username;
            body.password = config.password;
          }
        } else if (provider === 's3') {
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
        setStatus(
          res.ok ? t('Configuration Saved') : t('Error: {{message}}', { message: data.error }),
        );
      }
    } catch (err) {
      setStatus(
        t('Save failed: {{message}}', {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncStatus('');
    try {
      const engine = getSyncEngine();
      if (engine.hasTargets()) {
        await engine.syncAll();
        setSyncStatus(t('Sync completed'));
      } else {
        setSyncStatus(t('No sync target configured'));
      }
    } catch (err) {
      setSyncStatus(
        t('Sync failed: {{message}}', {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setSyncing(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors';
  const labelClass = 'text-xs font-medium text-[var(--color-text-secondary)] mb-1 block';

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Cloud size={16} className="text-[var(--color-accent)]" />
        <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Cloud Sync')}</h3>
      </div>
      <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
        {t(
          'Sync data across devices via an API server, S3-compatible storage, or WebDAV. Configure a sync target and interval below.',
        )}
      </p>

      <div className="space-y-4">
        <div>
          <label className={labelClass}>{t('Sync Provider')}</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as '' | 'api-server' | 's3' | 'webdav')}
            className={inputClass}
          >
            <option value="">{t('Not Configured')}</option>
            <option value="api-server">{t('API Server (My Little Todo)')}</option>
            <option value="s3">{t('S3 Compatible Storage (AWS/MinIO/R2)')}</option>
            <option value="webdav">WebDAV</option>
          </select>
        </div>

        {provider === 'api-server' && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>{t('Server URL')}</label>
              <input
                type="url"
                value={config.endpoint}
                onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
                placeholder="https://your-server.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('Authentication Mode')}</label>
              <div className="flex rounded-xl border border-[var(--color-border)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setApiAuthMode('credentials')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    apiAuthMode === 'credentials'
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]'
                  }`}
                >
                  {t('Username & Password')}
                </button>
                <button
                  type="button"
                  onClick={() => setApiAuthMode('token')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    apiAuthMode === 'token'
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]'
                  }`}
                >
                  {t('Token / API Key')}
                </button>
              </div>
            </div>
            {apiAuthMode === 'credentials' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>{t('Username')}</label>
                  <input
                    type="text"
                    value={config.username}
                    onChange={(e) => setConfig({ ...config, username: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t('Password')}</label>
                  <input
                    type="password"
                    value={config.password}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className={labelClass}>{t('Token / API Key')}</label>
                <input
                  type="password"
                  value={config.token}
                  onChange={(e) => setConfig({ ...config, token: e.target.value })}
                  placeholder={t('Paste JWT or long-lived API token')}
                  className={inputClass}
                />
                <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
                  {t('Generate a long-lived token from the server admin panel or API.')}
                </p>
              </div>
            )}
          </div>
        )}

        {provider === 's3' && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Endpoint URL</label>
              <input
                type="text"
                value={config.endpoint}
                onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
                placeholder="https://s3.amazonaws.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Bucket</label>
              <input
                type="text"
                value={config.bucket}
                onChange={(e) => setConfig({ ...config, bucket: e.target.value })}
                placeholder="my-todo-sync"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Access Key</label>
                <input
                  type="password"
                  value={config.access_key}
                  onChange={(e) => setConfig({ ...config, access_key: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Secret Key</label>
                <input
                  type="password"
                  value={config.secret_key}
                  onChange={(e) => setConfig({ ...config, secret_key: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>{t('Region (Optional)')}</label>
              <input
                type="text"
                value={config.region}
                onChange={(e) => setConfig({ ...config, region: e.target.value })}
                placeholder="us-east-1"
                className={inputClass}
              />
            </div>
          </div>
        )}

        {provider === 'webdav' && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>WebDAV URL</label>
              <input
                type="url"
                value={config.endpoint}
                onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
                placeholder="https://dav.example.com/sync/"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>{t('Username (Optional)')}</label>
                <input
                  type="text"
                  value={config.username}
                  onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t('Password (Optional)')}</label>
                <input
                  type="password"
                  value={config.password}
                  onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}

        {provider && (
          <>
            <hr style={{ borderColor: 'var(--color-border)' }} />
            <div>
              <label className={labelClass}>{t('Sync Interval')}</label>
              <select
                value={syncInterval}
                onChange={(e) => setSyncInterval(e.target.value)}
                className={inputClass}
              >
                <option value="60000">{t('Every 1 minute')}</option>
                <option value="300000">{t('Every 5 minutes')}</option>
                <option value="900000">{t('Every 15 minutes')}</option>
                <option value="1800000">{t('Every 30 minutes')}</option>
                <option value="3600000">{t('Every 1 hour')}</option>
                <option value="0">{t('Manual only')}</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {t('Auto-resolve conflicts (Last Write Wins)')}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  {conflictStrategy === 'lww'
                    ? t('Conflicts are resolved automatically by timestamp.')
                    : t('You will be prompted to choose when conflicts occur.')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={conflictStrategy === 'lww'}
                onClick={() =>
                  setConflictStrategy((prev) => (prev === 'lww' ? 'manual' : 'lww'))
                }
                className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                style={{
                  backgroundColor:
                    conflictStrategy === 'lww'
                      ? 'var(--color-accent)'
                      : 'var(--color-border)',
                }}
              >
                <span
                  className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform duration-200 ease-in-out"
                  style={{
                    transform: conflictStrategy === 'lww' ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </button>
            </div>
          </>
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
              onClick={handleSyncNow}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {syncing ? t('Syncing...') : t('Sync Now')}
            </button>
          </div>
        )}

        {lastSyncAt > 0 && (
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {t('Last synced')}: {new Date(lastSyncAt).toLocaleString()}
          </p>
        )}

        {status && <p className="text-xs text-[var(--color-text-secondary)]">{status}</p>}
        {syncStatus && (
          <p className="text-xs text-[var(--color-text-secondary)]">{syncStatus}</p>
        )}
      </div>
    </section>
  );
}

function UpdateDialog({
  version,
  notes,
  status,
  progress,
  onDownload,
  onRelaunch,
  onClose,
}: {
  version: string;
  notes: string;
  status: 'available' | 'downloading' | 'ready';
  progress: number;
  onDownload: () => void;
  onRelaunch: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('settings');

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      role="presentation"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>
            {t('New version available: v{{version}}', { version })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 transition-colors hover:bg-[var(--color-bg)]"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <XCircle size={18} />
          </button>
        </div>

        {notes && (
          <div
            className="mb-4 max-h-60 overflow-y-auto rounded-lg p-3 text-[13px] leading-relaxed whitespace-pre-wrap"
            style={{
              background: 'var(--color-bg)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            {notes}
          </div>
        )}

        {status === 'downloading' && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('Downloading update... {{progress}}%', { progress })}
              </span>
              <Loader2 size={12} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
            </div>
            <div className="w-full h-2 rounded-full" style={{ background: 'var(--color-border)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%`, background: 'var(--color-accent)' }}
              />
            </div>
          </div>
        )}

        {status === 'ready' && (
          <div className="mb-4 flex items-center gap-2 rounded-lg p-2.5" style={{ background: 'color-mix(in srgb, var(--color-success, #22c55e) 10%, transparent)' }}>
            <CheckCircle size={16} style={{ color: 'var(--color-success, #22c55e)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-success, #22c55e)' }}>
              {t('Update installed successfully')}
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {status === 'available' && (
            <button
              type="button"
              onClick={onDownload}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95"
              style={{ background: 'var(--color-accent)' }}
            >
              <HardDriveDownload size={14} />
              {t('Download and Install')}
            </button>
          )}
          {status === 'ready' && (
            <button
              type="button"
              onClick={onRelaunch}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95"
              style={{ background: 'var(--color-accent)' }}
            >
              <RefreshCw size={14} />
              {t('Restart Now')}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function AboutTab() {
  const { t } = useTranslation('settings');
  const showToast = useToastStore((s) => s.showToast);
  const tauri = isTauriEnv();
  const capacitor = isCapacitorEnv();
  const supportsUpdate = tauri || capacitor;

  type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateVersion, setUpdateVersion] = useState('');
  const [updateNotes, setUpdateNotes] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [autoCheck, setAutoCheck] = useState(() => {
    return localStorage.getItem('mlt-auto-check-update') !== 'false';
  });
  const updateRef = useRef<Awaited<
    ReturnType<typeof import('@tauri-apps/plugin-updater').check>
  > | null>(null);
  const githubApkUrl = useRef('');
  const githubHtmlUrl = useRef('');
  const autoCheckDone = useRef(false);

  const handleCheckUpdate = useCallback(async (silent = false) => {
    setUpdateStatus('checking');
    try {
      if (tauri) {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (update) {
          updateRef.current = update;
          setUpdateVersion(update.version);
          setUpdateNotes(update.body ?? '');
          setUpdateStatus('available');
          setShowUpdateDialog(true);
        } else {
          setUpdateStatus('idle');
          if (!silent) showToast({ type: 'info', message: t('Already up to date') });
        }
      } else {
        const info = await checkGitHubUpdate(APP_VERSION);
        if (info) {
          githubApkUrl.current = info.apkUrl;
          githubHtmlUrl.current = info.htmlUrl;
          setUpdateVersion(info.version);
          setUpdateNotes(info.notes);
          setUpdateStatus('available');
          setShowUpdateDialog(true);
        } else {
          setUpdateStatus('idle');
          if (!silent) showToast({ type: 'info', message: t('Already up to date') });
        }
      }
    } catch (e: unknown) {
      setUpdateStatus('idle');
      if (!silent) {
        const msg = String(e);
        const isNetwork = msg.includes('fetch') || msg.includes('network') || msg.includes('JSON') || msg.includes('404');
        showToast({
          type: 'error',
          message: isNetwork
            ? t('Unable to reach update server. Please check your network or try again later.')
            : t('Update check failed: {{message}}', { message: msg }),
        });
      }
    }
    localStorage.setItem('mlt-last-update-check', String(Date.now()));
  }, [showToast, t, tauri]);

  const handleDownloadAndInstall = useCallback(async () => {
    if (tauri) {
      const update = updateRef.current;
      if (!update) return;
      setUpdateStatus('downloading');
      setDownloadProgress(0);
      try {
        let totalLen = 0;
        let downloaded = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === 'Started' && event.data.contentLength) {
            totalLen = event.data.contentLength;
          } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
            if (totalLen > 0) setDownloadProgress(Math.round((downloaded / totalLen) * 100));
          } else if (event.event === 'Finished') {
            setDownloadProgress(100);
          }
        });
        setUpdateStatus('ready');
      } catch (e: unknown) {
        setUpdateStatus('error');
        setShowUpdateDialog(false);
        showToast({
          type: 'error',
          message: t('Update download failed: {{message}}', { message: String(e) }),
        });
      }
    } else {
      const url = githubApkUrl.current || githubHtmlUrl.current;
      if (url) window.open(url, '_system');
      setShowUpdateDialog(false);
      setUpdateStatus('idle');
    }
  }, [showToast, t, tauri]);

  const handleRelaunch = useCallback(async () => {
    if (tauri) {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    }
  }, [tauri]);

  const handleToggleAutoCheck = useCallback((enabled: boolean) => {
    setAutoCheck(enabled);
    localStorage.setItem('mlt-auto-check-update', String(enabled));
  }, []);

  useEffect(() => {
    if (!supportsUpdate || !autoCheck || autoCheckDone.current) return;
    autoCheckDone.current = true;
    const lastCheck = Number(localStorage.getItem('mlt-last-update-check') ?? '0');
    const fourHours = 4 * 60 * 60 * 1000;
    if (Date.now() - lastCheck > fourHours) {
      handleCheckUpdate(true);
    }
  }, [supportsUpdate, autoCheck, handleCheckUpdate]);

  return (
    <div className="flex flex-col gap-4 text-sm text-[var(--color-text-secondary)]">
      <p>
        My Little Todo{' '}
        <span className="text-[var(--color-text-tertiary)]">
          v{APP_VERSION}
          <span className="ml-1 text-[10px] opacity-60">({__GIT_HASH__})</span>
        </span>
      </p>
      <p className="text-xs text-[var(--color-text-tertiary)]">
        {t('This is not a task manager — this is your external execution system.')}
      </p>

      <a
        href="https://afdian.com/a/xter123"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 mt-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors w-fit"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)',
        }}
      >
        <Coffee size={16} className="text-[var(--color-accent)]" />
        {t('Buy me a bubble tea')}
        <ExternalLink size={12} className="text-[var(--color-text-tertiary)]" />
      </a>

      {supportsUpdate && (
        <div
          className="flex flex-col gap-3 mt-2 p-4 rounded-xl"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCheckUpdate(false)}
                disabled={updateStatus === 'checking'}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                style={{ background: 'var(--color-accent)', color: '#fff' }}
              >
                {updateStatus === 'checking' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                {updateStatus === 'checking' ? t('Checking for updates...') : t('Check for Updates')}
              </button>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('Auto check updates')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={autoCheck}
                onClick={() => handleToggleAutoCheck(!autoCheck)}
                className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200"
                style={{
                  background: autoCheck ? 'var(--color-accent)' : 'var(--color-border)',
                }}
              >
                <span
                  className="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200"
                  style={{
                    transform: autoCheck ? 'translate(17px, 2px)' : 'translate(2px, 2px)',
                  }}
                />
              </button>
            </label>
          </div>
        </div>
      )}

      {showUpdateDialog && (updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'ready') && (
        <UpdateDialog
          version={updateVersion}
          notes={updateNotes}
          status={updateStatus}
          progress={downloadProgress}
          onDownload={handleDownloadAndInstall}
          onRelaunch={handleRelaunch}
          onClose={() => {
            if (updateStatus !== 'downloading') setShowUpdateDialog(false);
          }}
        />
      )}
    </div>
  );
}

/* ── AI Tab ── */

const MCP_TOOLS = {
  read: [
    { name: 'get_overview', desc: 'Global overview' },
    { name: 'list_tasks', desc: 'List tasks' },
    { name: 'get_task', desc: 'Get task details' },
    { name: 'list_stream', desc: 'List stream entries' },
    { name: 'search', desc: 'Full-text search' },
  ],
  write: [
    { name: 'create_task', desc: 'Create task' },
    { name: 'update_task', desc: 'Update task' },
    { name: 'delete_task', desc: 'Delete task' },
    { name: 'add_stream', desc: 'Add stream entry' },
  ],
};

const IDE_CONFIGS: {
  id: string;
  label: string;
  pathHint: string;
}[] = [
  {
    id: 'cursor',
    label: 'Cursor',
    pathHint: '.cursor/mcp.json',
  },
  {
    id: 'claude',
    label: 'Claude Desktop',
    pathHint: '~/Library/Application Support/Claude/claude_desktop_config.json (macOS)',
  },
  {
    id: 'vscode',
    label: 'VS Code (Copilot)',
    pathHint: '.vscode/mcp.json',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    pathHint: '~/.codeium/windsurf/mcp_config.json',
  },
  {
    id: 'generic',
    label: 'Generic',
    pathHint: '',
  },
];

const MODEL_SUGGESTIONS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-3.5-turbo',
  'deepseek-chat',
  'deepseek-reasoner',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
];

function AiTab() {
  const { t } = useTranslation('settings');
  const isAdmin = useAuthStore((s) => s.user?.is_admin ?? false);
  const showToast = useToastStore((s) => s.showToast);

  const [apiKey, setApiKey] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('https://api.openai.com/v1');
  const [aiModel, setAiModel] = useState('');
  const [aiSaved, setAiSaved] = useState(false);

  const [sharedAvailable, setSharedAvailable] = useState(false);
  const [sharedAllowUserKey, setSharedAllowUserKey] = useState(true);

  const [adminSharedEnabled, setAdminSharedEnabled] = useState(false);
  const [adminAllowUserKey, setAdminAllowUserKey] = useState(true);
  const [adminSharedKey, setAdminSharedKey] = useState('');
  const [adminSharedEndpoint, setAdminSharedEndpoint] = useState('');
  const [adminSharedModel, setAdminSharedModel] = useState('');
  const [adminSaved, setAdminSaved] = useState(false);

  const [selectedIde, setSelectedIde] = useState('cursor');
  const [copied, setCopied] = useState(false);

  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [toolsSaved, setToolsSaved] = useState(false);

  useEffect(() => {
    getSetting('ai-api-key').then((v) => {
      if (v) setApiKey(v);
    });
    getSetting('ai-api-endpoint').then((v) => {
      if (v) setApiEndpoint(v);
    });
    getSetting('ai-model').then((v) => {
      if (v) setAiModel(v);
    });
    getSetting('mcp-disabled-tools').then((v) => {
      if (v) {
        try {
          setDisabledTools(JSON.parse(v));
        } catch {
          /* ignore */
        }
      }
    });

    if (!isNativeClient()) {
      const token = getAuthToken();
      if (token) {
        fetch(`${getSettingsApiBase()}/api/ai/shared-config`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.available) {
              setSharedAvailable(true);
              setSharedAllowUserKey(d.allow_user_key ?? true);
            }
          })
          .catch(() => {});
      }
    }

    if (isAdmin) {
      getSetting('admin:ai-shared-enabled').then((v) => {
        if (v === 'true') setAdminSharedEnabled(true);
      });
      getSetting('admin:ai-allow-user-key').then((v) => {
        if (v !== null) setAdminAllowUserKey(v !== 'false');
      });
      getSetting('admin:ai-shared-key').then((v) => {
        if (v) setAdminSharedKey(v);
      });
      getSetting('admin:ai-shared-endpoint').then((v) => {
        if (v) setAdminSharedEndpoint(v);
      });
      getSetting('admin:ai-shared-model').then((v) => {
        if (v) setAdminSharedModel(v);
      });
    }
  }, [isAdmin]);

  const handleSaveAi = async () => {
    await putSetting('ai-api-key', apiKey);
    await putSetting('ai-api-endpoint', apiEndpoint);
    await putSetting('ai-model', aiModel);
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2000);
  };

  const handleSaveAdmin = async () => {
    await putSetting('admin:ai-shared-enabled', String(adminSharedEnabled));
    await putSetting('admin:ai-allow-user-key', String(adminAllowUserKey));
    await putSetting('admin:ai-shared-key', adminSharedKey);
    await putSetting('admin:ai-shared-endpoint', adminSharedEndpoint);
    await putSetting('admin:ai-shared-model', adminSharedModel);
    setAdminSaved(true);
    setTimeout(() => setAdminSaved(false), 2000);
  };

  const handleToggleTool = async (toolName: string) => {
    const next = disabledTools.includes(toolName)
      ? disabledTools.filter((t) => t !== toolName)
      : [...disabledTools, toolName];
    setDisabledTools(next);
    await putSetting('mcp-disabled-tools', JSON.stringify(next));
    setToolsSaved(true);
    setTimeout(() => setToolsSaved(false), 1500);
  };

  const token = getAuthToken();
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        'my-little-todo': {
          url: `${baseUrl}/api/mcp`,
          headers: {
            Authorization: `Bearer ${token || '<your-token>'}`,
          },
        },
      },
    },
    null,
    2,
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mcpConfig);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast({ type: 'error', message: t('Copy failed') });
    }
  };

  const ideConfig = IDE_CONFIGS.find((c) => c.id === selectedIde) ?? IDE_CONFIGS[0];
  const nativeAi = isNativeClient();
  const showUserApiSection = sharedAllowUserKey || !sharedAvailable;

  return (
    <div className="flex flex-col gap-6">
      {/* AI Configuration */}
      {showUserApiSection && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Key size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">{t('AI Configuration')}</h3>
          </div>
          {sharedAvailable && !apiKey && (
            <div
              className="rounded-lg px-3 py-2 mb-3 text-xs"
              style={{
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
              }}
            >
              {t('A shared API is provided by the admin. You can also set your own key below.')}
            </div>
          )}
          <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
            {t(
              'Enter an OpenAI-compatible API key for smart task extraction, recommendations, and more. The key is stored locally only.',
            )}
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
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-[var(--color-text-tertiary)] shrink-0" />
            <input
              type="text"
              list="model-suggestions"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder={t('Model name (e.g. gpt-4o)')}
              className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
            />
            <datalist id="model-suggestions">
              {MODEL_SUGGESTIONS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
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
      )}

      {!showUserApiSection && sharedAvailable && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Key size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">{t('AI Configuration')}</h3>
          </div>
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              background: 'var(--color-accent-soft)',
              color: 'var(--color-accent)',
            }}
          >
            {t('AI is configured by the admin. A shared API is available for all users.')}
          </div>
        </section>
      )}

      {/* Admin AI Management — server mode only */}
      {!nativeAi && isAdmin && (
        <>
          <hr style={{ borderColor: 'var(--color-border)' }} />
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={16} className="text-[var(--color-accent)]" />
              <h3 className="text-sm font-bold text-[var(--color-text)]">
                {t('Admin AI Management')}
              </h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {t('Allow users to set own API key')}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {t('When disabled, users can only use the shared API')}
                  </p>
                </div>
                <ToggleSwitch
                  checked={adminAllowUserKey}
                  onChange={(v) => setAdminAllowUserKey(v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {t('Provide shared API for all users')}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {t('Users without their own key will use this shared API')}
                  </p>
                </div>
                <ToggleSwitch
                  checked={adminSharedEnabled}
                  onChange={(v) => setAdminSharedEnabled(v)}
                />
              </div>

              {adminSharedEnabled && (
                <div className="space-y-2 pl-2 border-l-2 border-[var(--color-border)]">
                  <input
                    type="password"
                    value={adminSharedKey}
                    onChange={(e) => setAdminSharedKey(e.target.value)}
                    placeholder={t('Shared API Key')}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                  <input
                    type="url"
                    value={adminSharedEndpoint}
                    onChange={(e) => setAdminSharedEndpoint(e.target.value)}
                    placeholder={t('Shared API Endpoint')}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                  <input
                    type="text"
                    value={adminSharedModel}
                    onChange={(e) => setAdminSharedModel(e.target.value)}
                    placeholder={t('Shared Model Name')}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveAdmin}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                  adminSaved
                    ? 'bg-[var(--color-success)] text-white'
                    : 'bg-[var(--color-accent)] text-white hover:scale-[1.02] active:scale-95'
                }`}
              >
                {adminSaved ? t('Saved') : t('Save Admin Config')}
              </button>
            </div>
          </section>
        </>
      )}

      {/* MCP Integration — server mode only */}
      {!nativeAi && <>
      <hr style={{ borderColor: 'var(--color-border)' }} />

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Server size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('MCP Integration')}</h3>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          {t(
            'Connect AI agents (Cursor, Claude Desktop, etc.) to your task system via MCP protocol.',
          )}
        </p>

        <div className="space-y-3">
          {/* IDE selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-secondary)] shrink-0">{t('IDE')}</span>
            <select
              value={selectedIde}
              onChange={(e) => setSelectedIde(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] outline-none"
            >
              {IDE_CONFIGS.map((ide) => (
                <option key={ide.id} value={ide.id}>
                  {ide.label}
                </option>
              ))}
            </select>
          </div>

          {/* Config preview */}
          <div className="relative">
            <pre
              className="rounded-xl p-3 text-xs font-mono overflow-x-auto"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {mcpConfig}
            </pre>
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 rounded-lg p-1.5 transition-colors hover:bg-[var(--color-surface)]"
              title={t('Copy')}
            >
              {copied ? (
                <CheckCircle size={14} className="text-emerald-500" />
              ) : (
                <Copy size={14} className="text-[var(--color-text-tertiary)]" />
              )}
            </button>
          </div>

          {/* Config file path hint */}
          {ideConfig.pathHint && (
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              {t('Config file')}: <code className="font-mono">{ideConfig.pathHint}</code>
            </p>
          )}

          {/* Skills link */}
          <a
            href="https://github.com/X-T-E-R/my-little-todo/blob/main/skills/SKILL.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline w-fit"
          >
            <ExternalLink size={12} />
            {t('View MCP usage guide (Skills)')}
          </a>
        </div>
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* MCP Tool Toggles */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('MCP Tool Access')}</h3>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          {t(
            'Control which MCP tools are available to AI agents. Disabled tools will not appear in tool listings.',
          )}
        </p>

        <div className="space-y-4">
          {/* Read tools */}
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              {t('Read Operations')}
            </p>
            <div className="space-y-1">
              {MCP_TOOLS.read.map((tool) => (
                <div key={tool.name} className="flex items-center justify-between py-1.5">
                  <div>
                    <span className="text-sm font-mono text-[var(--color-text)]">{tool.name}</span>
                    <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">
                      {t(tool.desc)}
                    </span>
                  </div>
                  <ToggleSwitch
                    checked={!disabledTools.includes(tool.name)}
                    onChange={() => handleToggleTool(tool.name)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Write tools */}
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              {t('Write Operations')}
            </p>
            <div className="space-y-1">
              {MCP_TOOLS.write.map((tool) => (
                <div key={tool.name} className="flex items-center justify-between py-1.5">
                  <div>
                    <span className="text-sm font-mono text-[var(--color-text)]">{tool.name}</span>
                    <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">
                      {t(tool.desc)}
                    </span>
                  </div>
                  <ToggleSwitch
                    checked={!disabledTools.includes(tool.name)}
                    onChange={() => handleToggleTool(tool.name)}
                  />
                </div>
              ))}
            </div>
          </div>

          {toolsSaved && (
            <span className="text-xs text-emerald-500 flex items-center gap-1">
              <CheckCircle size={12} />
              {t('Saved')}
            </span>
          )}
        </div>
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* API Usage Statistics (placeholder) */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('API Usage')}</h3>
        </div>
        <div
          className="rounded-xl p-4 text-center"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {t(
              'AI features are under development. Usage statistics will appear here once available.',
            )}
          </p>
          {isAdmin && (
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              {t('As admin, you will also see global usage statistics here.')}
            </p>
          )}
        </div>
      </section>
      </>}
    </div>
  );
}

/* ── Shared Components ── */

function ScheduleTab() {
  const { load } = useScheduleStore();
  useEffect(() => {
    load();
  }, [load]);
  return <ScheduleEditor />;
}

const TAB_CONTENT: Record<SettingsTab, () => React.JSX.Element> = {
  general: GeneralTab,
  account: AccountTab,
  ai: AiTab,
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
  const isMobile = useIsMobile();
  const authMode = useAuthStore((s) => s.authMode);
  const showShortcuts = hasKeyboardShortcuts();

  const TABS = BASE_TABS.filter((tab) => {
    if (tab.id === 'shortcuts' && !showShortcuts) return false;
    if (tab.id === 'account' && authMode === 'none') return false;
    return true;
  });

  const visibleTabs = TABS;

  const ActiveContent = TAB_CONTENT[activeTab] ?? GeneralTab;

  return (
    <div className={`flex h-full bg-[var(--color-bg)] ${isMobile ? 'flex-col' : ''}`}>
      {isMobile ? (
        <div
          className="flex items-center gap-0.5 px-2 pt-2 pb-1 overflow-x-auto shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          {visibleTabs.map((tab) => {
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

          {visibleTabs.map((tab) => {
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
              {t(visibleTabs.find((tab) => tab.id === activeTab)?.label ?? '')}
            </h2>
            <ActiveContent />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
