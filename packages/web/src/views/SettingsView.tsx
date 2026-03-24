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
  Trash2,
  Upload,
  User,
  Users,
  Wifi,
  XCircle,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScheduleEditor } from '../components/ScheduleEditor';
import i18n from '../locales';
import { deleteSetting, getSetting, getSettingsApiBase, putSetting } from '../storage/settingsApi';
import {
  useRoleStore,
  useScheduleStore,
  useShortcutStore,
  useStreamStore,
  useTaskStore,
} from '../stores';
import { getAuthToken, useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import {
  canChooseMode,
  canControlServer,
  canEditBackendUrl,
  canExportToFolder,
  getPlatform,
  hasKeyboardShortcuts,
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
  | 'about'
  | 'admin';

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

      const savedPath = await getSetting('auto-export-path');
      if (savedPath) {
        setAutoExportPath(savedPath);
        setAutoExportEnabled(true);
      }
    })();
  }, []);

  const isTauriDataTab = canExportToFolder();
  const showToast = useToastStore((s) => s.showToast);

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
          const entries: { path: string; content: string }[] = Array.isArray(data)
            ? data
            : data.files || [];
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
          ...data,
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

      {storageInfo && <hr style={{ borderColor: 'var(--color-border)' }} />}

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
          {isTauriDataTab ? (
            <>
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

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* Migration */}
      <section>
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
      </section>

      {isTauriDataTab && <hr style={{ borderColor: 'var(--color-border)' }} />}

      {/* Continuous export — Tauri only */}
      {isTauriDataTab && (
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
  const showModeSelector = canChooseMode();
  const showServerConfig = canControlServer();
  const editableBackend = canEditBackendUrl();

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [serverRunning, setServerRunning] = useState(false);
  const [serverHost, setServerHost] = useState('127.0.0.1');
  const [serverPort, setServerPort] = useState(3001);
  const [pendingHost, setPendingHost] = useState('127.0.0.1');
  const [pendingPort, setPendingPort] = useState(3001);
  const [restarting, setRestarting] = useState(false);
  const [restartMsg, setRestartMsg] = useState('');
  const [restartIsError, setRestartIsError] = useState(false);

  const [useMode, setUseMode] = useState<'local' | 'cloud'>(
    () => (localStorage.getItem('mlt-use-mode') as 'local' | 'cloud') || 'local',
  );
  const [cloudUrl, setCloudUrl] = useState(() => localStorage.getItem('mlt-cloud-url') || '');
  const [modeSaved, setModeSaved] = useState(false);
  const [serverAuthMode, setServerAuthMode] = useState<string>('none');
  const [pendingAuthMode, setPendingAuthMode] = useState<string>('none');

  const isLanSharing = serverHost === '0.0.0.0';

  useEffect(() => {
    if (platform === 'tauri') {
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
          setServerAuthMode(cfg.auth_mode);
          setPendingAuthMode(cfg.auth_mode);
        } catch {
          /* ignore */
        }
      })();
    } else {
      (async () => {
        try {
          const res = await fetch(`${getSettingsApiBase()}/health`, {
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) setServerRunning(true);
        } catch {
          /* not reachable */
        }
      })();
    }
  }, [platform]);

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMsg('');
    try {
      const res = await fetch(`${getSettingsApiBase()}/health`);
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

  const handleRestart = async () => {
    if (!showServerConfig) return;
    setRestarting(true);
    setRestartMsg('');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      try {
        await invoke('stop_embedded_server');
      } catch {
        /* might not be running */
      }
      await new Promise((r) => setTimeout(r, 300));
      const url = await invoke<string>('start_embedded_server', {
        port: pendingPort,
        host: pendingHost,
        authMode: pendingAuthMode,
      });
      setServerHost(pendingHost);
      setServerPort(pendingPort);
      setServerAuthMode(pendingAuthMode);
      setServerRunning(true);
      setRestartIsError(false);
      setRestartMsg(t('Server restarted at {{url}}', { url }));
    } catch (err) {
      setRestartIsError(true);
      setRestartMsg(
        t('Restart failed: {{message}}', {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setRestarting(false);
    }
  };

  const hasChanges =
    pendingHost !== serverHost || pendingPort !== serverPort || pendingAuthMode !== serverAuthMode;

  return (
    <div className="flex flex-col gap-6">
      {/* Usage mode selector — Tauri only */}
      {showModeSelector && (
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

      {showModeSelector && <hr style={{ borderColor: 'var(--color-border)' }} />}

      {/* Connection status */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Cloud size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Backend Connection')}</h3>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          {platform === 'web-hosted'
            ? t('Hosted by the server — the backend address is fixed to the current domain.')
            : t(
                'Data is read, written, and synced through the API server. The PC desktop version auto-starts an embedded server; the web version uses the current domain.',
              )}
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

          {/* Editable backend URL for capacitor / web-standalone (non-Tauri, non-hosted) */}
          {!showModeSelector && editableBackend && (
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

      {/* Server config — only in Tauri PC mode */}
      {showServerConfig && (
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
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {t('Allow LAN Access')}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      {isLanSharing
                        ? t('Other devices can connect via LAN')
                        : t('Local access only')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPendingHost(pendingHost === '0.0.0.0' ? '127.0.0.1' : '0.0.0.0')
                  }
                  className="relative h-6 w-11 rounded-full transition-colors shrink-0"
                  style={{
                    background:
                      pendingHost === '0.0.0.0' ? 'var(--color-accent)' : 'var(--color-border)',
                  }}
                >
                  <motion.div
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
                    animate={{ left: pendingHost === '0.0.0.0' ? '22px' : '2px' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  />
                </button>
              </div>

              {/* Auth mode */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield size={15} style={{ color: 'var(--color-text-secondary)' }} />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">{t('Auth Mode')}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      {t('Authentication mode for the embedded server')}
                    </p>
                  </div>
                </div>
                <select
                  value={pendingAuthMode}
                  onChange={(e) => setPendingAuthMode(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] outline-none"
                >
                  <option value="none">{t('No Auth')}</option>
                  <option value="single">{t('Single User')}</option>
                  <option value="multi">{t('Multi User')}</option>
                </select>
              </div>

              {/* Custom bind address (advanced) */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Globe size={15} style={{ color: 'var(--color-text-secondary)' }} />
                  <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                    {t('Listen Address and Port')}
                  </p>
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
                  {t(
                    '127.0.0.1 = local only · 0.0.0.0 = all interfaces · or specify a network interface IP',
                  )}
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
                <p
                  className={`text-xs rounded-lg p-3 ${
                    restartIsError
                      ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                      : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                  }`}
                >
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
          if (data.provider) {
            setProvider(data.provider as '' | 's3' | 'webdav');
            setConfig((prev) => ({
              ...prev,
              endpoint: data.endpoint ?? '',
              bucket: data.bucket ?? '',
              access_key: data.access_key ?? '',
              secret_key: data.secret_key ?? '',
              region: data.region ?? '',
              username: data.username ?? '',
              password: data.password ?? '',
            }));
          }
        }
      } catch {
        /* ignore */
      }
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
      setStatus(
        res.ok ? t('Configuration Saved') : t('Error: {{message}}', { message: data.error }),
      );
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
      setBackupStatus(
        res.ok ? t('Backup Complete') : t('Error: {{message}}', { message: data.error }),
      );
    } catch (err) {
      setBackupStatus(
        t('Backup failed: {{message}}', {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setBackupRunning(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors';
  const labelClass = 'text-xs font-medium text-[var(--color-text-secondary)] mb-1 block';

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Cloud size={16} className="text-[var(--color-accent)]" />
        <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Cloud Backup')}</h3>
      </div>
      <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
        {t(
          'Back up data to S3-compatible object storage or a WebDAV server. This feature is under construction; some providers may not be fully available yet.',
        )}
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
                placeholder="my-todo-backup"
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
                placeholder="https://dav.example.com/backup/"
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
        {backupStatus && (
          <p className="text-xs text-[var(--color-text-secondary)]">{backupStatus}</p>
        )}
      </div>
    </section>
  );
}

/* ── Admin Tab (visible to admins only) ── */

interface AdminUserItem {
  id: string;
  username: string;
  is_admin: boolean;
  created_at: string;
}

function AdminTab() {
  const { t } = useTranslation('settings');
  const [stats, setStats] = useState<{
    total_users: number;
    db_type: string;
    auth_mode: string;
  } | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPw, setNewPw] = useState('');
  const [error, setError] = useState('');
  const showToast = useToastStore((s) => s.showToast);

  const apiHeaders = useCallback((): HeadersInit => {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    const token = getAuthToken();
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${getSettingsApiBase()}/api/admin/stats`, { headers: apiHeaders() });
      if (res.ok) setStats(await res.json());
    } catch {
      /* ignore */
    }
  }, [apiHeaders]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch(`${getSettingsApiBase()}/api/admin/users`, { headers: apiHeaders() });
      if (res.ok) setUsers(await res.json());
    } catch {
      /* ignore */
    }
  }, [apiHeaders]);

  useEffect(() => {
    loadStats();
    loadUsers();
  }, [loadStats, loadUsers]);

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(t('Confirm delete user {{username}}?', { username }))) return;
    try {
      const res = await fetch(`${getSettingsApiBase()}/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      showToast({ type: 'success', message: t('User {{username}} deleted', { username }) });
      loadUsers();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleReset = async (id: string) => {
    if (!newPw) return;
    try {
      const res = await fetch(`${getSettingsApiBase()}/api/admin/users/${id}/password`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ password: newPw }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      showToast({ type: 'success', message: t('Password reset successfully') });
      setResetId(null);
      setNewPw('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Server Overview */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Server Overview')}</h3>
        </div>
        {stats && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                label: t('Total Users'),
                value: String(stats.total_users),
                icon: <Users size={16} />,
              },
              { label: t('Database Type'), value: stats.db_type, icon: <Activity size={16} /> },
              { label: t('Auth Mode'), value: stats.auth_mode, icon: <Key size={16} /> },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <div className="mb-1.5 flex items-center gap-2 text-[var(--color-text-secondary)]">
                  {card.icon}
                  <span className="text-xs">{card.label}</span>
                </div>
                <p className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* User Management */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('User Management')}</h3>
        </div>
        {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">
                  {t('Username')}
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">
                  {t('Role')}
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">
                  {t('Created At')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-[var(--color-text-secondary)]">
                  {t('Actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3">{u.username}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.is_admin
                          ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]'
                          : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {u.is_admin ? t('Admin') : t('User')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">{u.created_at}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {resetId === u.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="password"
                            value={newPw}
                            onChange={(e) => setNewPw(e.target.value)}
                            placeholder={t('New Password')}
                            className="w-24 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleReset(u.id)}
                            className="rounded bg-[var(--color-accent)] px-2 py-1 text-xs text-white"
                          >
                            {t('Confirm')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResetId(null);
                              setNewPw('');
                            }}
                            className="rounded px-2 py-1 text-xs text-[var(--color-text-secondary)]"
                          >
                            {t('Cancel')}
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setResetId(u.id)}
                            className="rounded p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
                            title={t('Reset Password')}
                          >
                            <Key size={14} />
                          </button>
                          {!u.is_admin && (
                            <button
                              type="button"
                              onClick={() => handleDelete(u.id, u.username)}
                              className="rounded p-1 text-[var(--color-text-secondary)] hover:text-red-400"
                              title={t('Delete User')}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* Attachment Settings */}
      <AttachmentSettingsSection />
    </div>
  );
}

function AttachmentSettingsSection() {
  const { t } = useTranslation('settings');
  const showToast = useToastStore((s) => s.showToast);
  const [allowAttachments, setAllowAttachments] = useState(true);
  const [maxSizeMB, setMaxSizeMB] = useState(10);
  const [storage, setStorage] = useState('local');
  const [imageHostUrl, setImageHostUrl] = useState('');

  useEffect(() => {
    getSetting('admin:allow-attachments').then((v) => {
      if (v === 'false') setAllowAttachments(false);
    });
    getSetting('admin:attachment-max-size').then((v) => {
      if (v) setMaxSizeMB(Math.round(Number(v) / (1024 * 1024)));
    });
    getSetting('admin:attachment-storage').then((v) => {
      if (v) setStorage(v);
    });
    getSetting('admin:image-host-url').then((v) => {
      if (v) setImageHostUrl(v);
    });
  }, []);

  const handleSave = async () => {
    await putSetting('admin:allow-attachments', String(allowAttachments));
    await putSetting('admin:attachment-max-size', String(maxSizeMB * 1024 * 1024));
    await putSetting('admin:attachment-storage', storage);
    await putSetting('admin:image-host-url', imageHostUrl);
    showToast({ type: 'success', message: t('Attachment settings saved') });
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Upload size={16} className="text-[var(--color-accent)]" />
        <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Attachment Settings')}</h3>
      </div>
      <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <label className="flex items-center justify-between">
          <span className="text-sm" style={{ color: 'var(--color-text)' }}>
            {t('Allow attachments')}
          </span>
          <input
            type="checkbox"
            checked={allowAttachments}
            onChange={(e) => setAllowAttachments(e.target.checked)}
            className="h-4 w-4 rounded accent-[var(--color-accent)]"
          />
        </label>

        <div>
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t('Max file size (MB)')}
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={maxSizeMB}
            onChange={(e) => setMaxSizeMB(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
            style={{ color: 'var(--color-text)' }}
          />
        </div>

        <div>
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t('Storage backend')}
          </label>
          <div className="mt-1 flex gap-2">
            {['local', 's3', 'image-host'].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setStorage(opt)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: storage === opt ? 'var(--color-accent)' : 'var(--color-bg)',
                  color: storage === opt ? 'white' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {storage === 'image-host' && (
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t('Image host URL')}
            </label>
            <input
              type="url"
              value={imageHostUrl}
              onChange={(e) => setImageHostUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
              style={{ color: 'var(--color-text)' }}
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:scale-[1.02]"
          style={{ background: 'var(--color-accent)' }}
        >
          {t('Save')}
        </button>
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
  const autoCheckDone = useRef(false);

  const handleCheckUpdate = useCallback(async (silent = false) => {
    setUpdateStatus('checking');
    try {
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
    } catch (e: unknown) {
      setUpdateStatus('error');
      if (!silent) {
        showToast({
          type: 'error',
          message: t('Update check failed: {{message}}', { message: String(e) }),
        });
      }
    }
    localStorage.setItem('mlt-last-update-check', String(Date.now()));
  }, [showToast, t]);

  const handleDownloadAndInstall = useCallback(async () => {
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
  }, [showToast, t]);

  const handleRelaunch = useCallback(async () => {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  }, []);

  const handleToggleAutoCheck = useCallback((enabled: boolean) => {
    setAutoCheck(enabled);
    localStorage.setItem('mlt-auto-check-update', String(enabled));
  }, []);

  useEffect(() => {
    if (!tauri || !autoCheck || autoCheckDone.current) return;
    autoCheckDone.current = true;
    const lastCheck = Number(localStorage.getItem('mlt-last-update-check') ?? '0');
    const fourHours = 4 * 60 * 60 * 1000;
    if (Date.now() - lastCheck > fourHours) {
      handleCheckUpdate(true);
    }
  }, [tauri, autoCheck, handleCheckUpdate]);

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

      {tauri && (
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

      {/* Admin AI Management */}
      {isAdmin && (
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

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* MCP Integration */}
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
  admin: AdminTab,
};

/* ── Main Settings View ── */

export function SettingsView() {
  const { t } = useTranslation('settings');
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const isMobile = useIsMobile();
  const isAdmin = useAuthStore((s) => s.user?.is_admin ?? false);
  const authMode = useAuthStore((s) => s.authMode);
  const showShortcuts = hasKeyboardShortcuts();

  const TABS = BASE_TABS.filter((tab) => {
    if (tab.id === 'shortcuts' && !showShortcuts) return false;
    if (tab.id === 'account' && authMode === 'none') return false;
    return true;
  });

  const visibleTabs: typeof TABS = isAdmin
    ? [...TABS, { id: 'admin', label: 'Admin', icon: Shield }]
    : TABS;

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
