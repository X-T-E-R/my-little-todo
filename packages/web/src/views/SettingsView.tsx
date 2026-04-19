import { motion } from 'framer-motion';
import {
  Activity,
  Bell,
  Bot,
  CalendarClock,
  CheckCircle,
  ChevronDown,
  Cloud,
  Coffee,
  Command,
  Database,
  Download,
  ExternalLink,
  Filter,
  FolderOpen,
  Github,
  Globe,
  HardDriveDownload,
  Info,
  Key,
  LayoutGrid,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  PanelLeft,
  RefreshCw,
  RotateCcw,
  Rows3,
  Search,
  Server,
  Shield,
  Sparkles,
  StickyNote,
  Upload,
  User,
  Wind,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ThirdPartyPluginsPanel } from '../components/ThirdPartyPluginsPanel';
import i18n from '../locales';
import {
  BUILT_IN_MODULES,
  type BuiltinModuleCategory,
  type StabilityLevel,
  useModuleStore,
} from '../modules';
import { installedPluginsToAppModules } from '../plugins';
import { usePluginStore } from '../plugins/pluginStore';
import { ensureBuiltinSettingsRegistered } from '../settings/registerBuiltinSettings';
import {
  getSettingsEntries,
  getSettingsEntry,
  subscribeSettingsRegistry,
} from '../settings/registry';
import { getDataStore } from '../storage/dataStore';
import { deleteSetting, getSetting, getSettingsApiBase, putSetting } from '../storage/settingsApi';
import {
  useRoleStore,
  useShortcutStore,
  useStreamStore,
  useTaskStore,
  useTimeAwarenessStore,
} from '../stores';
import { getAuthToken, useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { getSyncEngine, type ConflictStrategy } from '../sync';
import { initSyncFromConfig } from '../sync/syncManager';
import { probeMltServer } from '../sync/serverProbe';
import {
  type BackupPayload,
  buildBackupPayload,
  importPayloadToStore,
  isLegacyBackupPayload,
  parseImportPayload,
} from '../utils/backupPayload';
import { checkGitHubUpdate } from '../utils/githubUpdater';
import { createHttpClient } from '../utils/httpClient';
import { mapApiError } from '../utils/i18nErrorMap';
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
  | 'shortcuts'
  | 'sync'
  | 'data'
  | 'plugins'
  | 'about'
  | `module:${string}`
  | `plugin:${string}`;

type BaseSettingsTab = Exclude<SettingsTab, `module:${string}` | `plugin:${string}`>;

type NavTab = {
  id: SettingsTab;
  label: string;
  icon: LucideIcon;
  /** If true, `label` is already human-readable (skip i18n). */
  rawLabel?: boolean;
};

const PRIMARY_TABS: NavTab[] = [
  { id: 'general', label: 'General', icon: Moon },
  { id: 'account', label: 'Account', icon: User },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'shortcuts', label: 'Shortcuts', icon: Command },
  { id: 'sync', label: 'Sync', icon: Cloud },
  { id: 'data', label: 'Data', icon: FolderOpen },
  { id: 'plugins', label: 'Plugins', icon: LayoutGrid },
];

const ABOUT_TAB: NavTab = { id: 'about', label: 'About', icon: Info };

function isCrossOriginApiBase(baseUrl: string): boolean {
  try {
    return new URL(baseUrl, window.location.origin).origin !== window.location.origin;
  } catch {
    return false;
  }
}

function SettingsEntryHost({
  source,
  entryId,
}: {
  source: 'builtin' | 'plugin';
  entryId: string;
}) {
  const [, setBump] = useState(0);
  useEffect(() => {
    return subscribeSettingsRegistry(() => setBump((n) => n + 1));
  }, []);
  const Comp = getSettingsEntry(source, entryId)?.component;
  if (!Comp) {
    return <p className="text-xs text-[var(--color-text-tertiary)]">{entryId}</p>;
  }
  return <Comp />;
}

const SettingsNavContext = createContext<{
  setActiveTab: (tab: SettingsTab) => void;
} | null>(null);

function useSettingsNav() {
  return useContext(SettingsNavContext);
}

const PLUGIN_ICONS: Record<string, LucideIcon> = {
  'ai-agent': Bot,
  kanban: LayoutGrid,
  'embedded-host': Server,
  'time-capsule': Sparkles,
  'ai-coach': Bot,
  'energy-indicator': Zap,
  'brain-dump': Coffee,
  'advanced-filter': Filter,
  'mcp-integration': Server,
  'desktop-widget': Monitor,
  'window-context': StickyNote,
  'time-awareness': CalendarClock,
  'stream-context-panel': PanelLeft,
  'think-session': Coffee,
  'work-thread': Rows3,
};

const MODULE_CATEGORY_ORDER: BuiltinModuleCategory[] = [
  'views-and-organization',
  'thinking-and-ai',
  'capture-and-context',
  'rhythm-and-feedback',
  'integrations',
];

function moduleCategoryLabel(category: BuiltinModuleCategory, zh: boolean): string {
  if (zh) {
    switch (category) {
      case 'views-and-organization':
        return '视图与组织';
      case 'thinking-and-ai':
        return '思考与 AI';
      case 'capture-and-context':
        return '捕获与上下文';
      case 'rhythm-and-feedback':
        return '节奏与反馈';
      case 'integrations':
        return '集成';
    }
  }

  switch (category) {
    case 'views-and-organization':
      return 'Views & Organization';
    case 'thinking-and-ai':
      return 'Thinking & AI';
    case 'capture-and-context':
      return 'Capture & Context';
    case 'rhythm-and-feedback':
      return 'Rhythm & Feedback';
    case 'integrations':
      return 'Integrations';
  }
}

function StabilityBadge({ stability }: { stability: StabilityLevel }) {
  if (stability === 'stable') return null;
  const label = stability === 'experimental' ? 'Experimental' : 'Beta';
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background:
          stability === 'experimental'
            ? 'color-mix(in oklab, #f97316 18%, transparent)'
            : 'color-mix(in oklab, #0284c7 18%, transparent)',
        color: stability === 'experimental' ? '#c2410c' : '#0369a1',
      }}
    >
      {label}
    </span>
  );
}

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
    <div ref={rowRef} className="flex items-center justify-between px-4 py-2.5">
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
          minWidth: '100px',
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
    <div className="flex flex-col gap-5">
      {/* Theme */}
      <section className="settings-card">
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
      <section className="settings-card">
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

      {/* Stream layout */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Wind size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Stream')}</h3>
        </div>
        <StreamDirectionSetting />
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

function StreamDirectionSetting() {
  const { t } = useTranslation('settings');
  const [value, setValue] = useState<'bottom-up' | 'top-down'>('bottom-up');

  useEffect(() => {
    getSetting('stream-direction').then((v) => {
      if (v === 'top-down' || v === 'bottom-up') setValue(v);
    });
  }, []);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">
          {t('Stream timeline direction')}
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)]">{t('stream_direction_hint')}</p>
      </div>
      <select
        value={value}
        onChange={async (e) => {
          const v = e.target.value as 'bottom-up' | 'top-down';
          setValue(v);
          await putSetting('stream-direction', v);
        }}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] shrink-0"
      >
        <option value="bottom-up">{t('stream_direction_bottom_up')}</option>
        <option value="top-down">{t('stream_direction_top_down')}</option>
      </select>
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
  const isLocalDesktop = !authMode && user?.id === 'local-desktop-user';

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

      {/* Identity Provider */}
      {(authMode || isLocalDesktop) && (
        <>
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Key size={16} className="text-[var(--color-accent)]" />
              <h3 className="text-sm font-bold text-[var(--color-text)]">
                {isLocalDesktop
                  ? t('Local Desktop Mode')
                  : authMode === 'external'
                    ? t('Identity Provider')
                    : t('Embedded Auth')}
              </h3>
            </div>
            <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {isLocalDesktop
                  ? t(
                      'This desktop app uses the embedded local backend and does not require sign-in.',
                    )
                  : authMode === 'external'
                    ? t(
                        'Password, MFA, session, and account recovery are now managed by the external identity provider.',
                      )
                    : t(
                        'This server is running in embedded auth mode. Ask an admin to reset passwords if needed.',
                      )}
              </p>
              {authMode === 'external' ? (
                <button
                  type="button"
                  onClick={() => void changePassword()}
                  className="rounded-xl px-4 py-2 text-sm font-medium transition-all bg-[var(--color-accent)] text-white hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                >
                  {t('Open Account Console')}
                </button>
              ) : null}
            </div>
          </section>

          <hr style={{ borderColor: 'var(--color-border)' }} />
        </>
      )}

      {/* Logout */}
      {!isLocalDesktop && (
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
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function PluginsTab() {
  const { t } = useTranslation('settings');
  const [subTab, setSubTab] = useState<'core' | 'third-party'>('core');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<BuiltinModuleCategory, boolean>>({
    'views-and-organization': false,
    'thinking-and-ai': false,
    'capture-and-context': false,
    'rhythm-and-feedback': false,
    integrations: false,
  });
  const moduleHydrated = useModuleStore((s) => s.hydrated);
  const moduleEnabled = useModuleStore((s) => s.enabled);
  const hydrateModules = useModuleStore((s) => s.hydrate);
  const setModuleEnabled = useModuleStore((s) => s.setModuleEnabled);
  const nav = useSettingsNav();
  const zh = i18n.language.startsWith('zh');

  const groupedModules = useMemo(() => {
    const groups = new Map<BuiltinModuleCategory, (typeof BUILT_IN_MODULES)[number][]>();
    for (const category of MODULE_CATEGORY_ORDER) {
      groups.set(category, []);
    }
    for (const mod of BUILT_IN_MODULES) {
      const category = mod.category ?? 'views-and-organization';
      groups.get(category)?.push(mod);
    }
    return MODULE_CATEGORY_ORDER.map((category) => ({
      category,
      label: moduleCategoryLabel(category, zh),
      modules: [...(groups.get(category) ?? [])].sort(
        (a, b) => (a.categoryOrder ?? 999) - (b.categoryOrder ?? 999),
      ),
    })).filter((group) => group.modules.length > 0);
  }, [zh]);

  useEffect(() => {
    void hydrateModules();
  }, [hydrateModules]);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
        {subTab === 'core' ? t('Modules intro') : t('Plugins thirdparty intro')}
      </p>

      <div
        className="flex gap-1 rounded-xl p-1 self-stretch sm:self-start"
        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
        role="tablist"
        aria-label={t('Plugins')}
      >
        {[
          { id: 'core' as const, label: t('Core Plugins') },
          { id: 'third-party' as const, label: t('Third-party Plugins') },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={subTab === tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors min-w-0 flex-1 sm:flex-none sm:min-w-[8rem] ${
              subTab === tab.id
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm ring-1 ring-[var(--color-border)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'core' && (
        <div className="space-y-3">
          {groupedModules.map((group) => {
            const collapsed = collapsedGroups[group.category];
            return (
              <section
                key={group.category}
                className="overflow-hidden rounded-2xl border border-[var(--color-border)]"
                style={{
                  background: 'color-mix(in srgb, var(--color-surface) 96%, var(--color-bg))',
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedGroups((prev) => ({
                      ...prev,
                      [group.category]: !prev[group.category],
                    }))
                  }
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-text)]">{group.label}</p>
                    <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                      {zh
                        ? `${group.modules.length} 个内置插件`
                        : `${group.modules.length} built-in modules`}
                    </p>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                    style={{ color: 'var(--color-text-tertiary)' }}
                  />
                </button>

                {!collapsed && (
                  <div className="space-y-1 border-t border-[var(--color-border)] p-1.5">
                    {group.modules.map((mod) => {
                      const Icon = PLUGIN_ICONS[mod.id] ?? Info;
                      const enabled = moduleEnabled[mod.id] ?? mod.defaultEnabled;
                      return (
                        <div
                          key={mod.id}
                          className="overflow-hidden rounded-xl border border-[var(--color-border)]"
                          style={{ background: 'var(--color-surface)' }}
                        >
                          <div className="flex items-center gap-3 px-4 py-3">
                            <Icon
                              size={18}
                              style={{
                                color: enabled
                                  ? 'var(--color-accent)'
                                  : 'var(--color-text-tertiary)',
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-[var(--color-text)]">
                                  {t(mod.nameKey)}
                                </p>
                                <StabilityBadge stability={mod.stability} />
                              </div>
                              <p className="text-[11px] text-[var(--color-text-tertiary)] truncate">
                                {t(mod.descriptionKey)}
                              </p>
                            </div>
                            <ToggleSwitch
                              disabled={!moduleHydrated}
                              checked={enabled}
                              onChange={(v) => void setModuleEnabled(mod.id, v)}
                            />
                          </div>

                          {mod.hasSettingsPage && enabled && (
                            <div className="px-4 pb-3">
                              {mod.stability !== 'stable' && (
                                <p className="mb-2 text-[11px] text-[var(--color-text-tertiary)]">
                                  This feature is not part of the stable release SLA and should not
                                  be your only backup path.
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() => nav?.setActiveTab(`module:${mod.id}` as SettingsTab)}
                                className="text-xs font-medium text-[var(--color-accent)] underline-offset-2 hover:underline"
                              >
                                {t('Go to plugin settings')}
                              </button>
                            </div>
                          )}
                          {!mod.hasSettingsPage && (
                            <div className="px-4 pb-3">
                              <p className="text-[11px] text-[var(--color-text-tertiary)]">
                                {mod.id === 'kanban'
                                  ? t('kanban_plugin_hint')
                                  : t('No extra settings')}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {subTab === 'third-party' && <ThirdPartyPluginsPanel />}
    </div>
  );
}

function ShortcutsTab() {
  const { t } = useTranslation('settings');
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const updateShortcut = useShortcutStore((s) => s.updateShortcut);
  const resetToDefaults = useShortcutStore((s) => s.resetToDefaults);
  const [searchQuery, setSearchQuery] = useState('');

  const scopes = [
    { key: 'global' as const, label: t('Global') },
    { key: 'editor' as const, label: t('Editor') },
    { key: 'plugin' as const, label: t('Plugins') },
  ] as const;

  const filteredByScope = (scope: string) =>
    shortcuts
      .filter((s) => s.scope === scope)
      .filter(
        (s) =>
          !searchQuery ||
          s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.keys.toLowerCase().includes(searchQuery.toLowerCase()),
      );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} className="shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('Search shortcuts...')}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            style={{ color: 'var(--color-text)' }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="shrink-0"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={resetToDefaults}
          className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-[11px] font-medium transition-colors hover:bg-[var(--color-bg)] shrink-0"
          style={{ color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}
        >
          <RotateCcw size={11} />
          {t('Reset Defaults')}
        </button>
      </div>

      <p className="text-xs text-[var(--color-text-tertiary)]">
        {t('Click on a shortcut area, then press a new key combination to customize.')}
      </p>

      {scopes.map(({ key, label }) => {
        const items = filteredByScope(key);
        if (items.length === 0) return null;
        return (
          <div key={key}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <p
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {label}
              </p>
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
              >
                {items.length}
              </span>
            </div>
            <div
              className="rounded-xl border border-[var(--color-border)] overflow-hidden divide-y divide-[var(--color-border)]"
              style={{ background: 'var(--color-surface)' }}
            >
              {items.map((s) => (
                <ShortcutRow
                  key={s.id}
                  label={s.label}
                  keys={s.keys}
                  onRecord={(keys) => updateShortcut(s.id, keys)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const APP_VERSION = __APP_VERSION__;

type DataTabStorageInfo = {
  db_type?: string;
  data_dir?: string;
  auth_provider?: string;
  admin_export_enabled?: boolean;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

async function loadDataTabInitialState(
  setStorageInfo: React.Dispatch<React.SetStateAction<DataTabStorageInfo | null>>,
  setAutoExportPath: React.Dispatch<React.SetStateAction<string>>,
  setAutoExportEnabled: React.Dispatch<React.SetStateAction<boolean>>,
) {
  if (!isNativeClient()) {
    try {
      const token = getAuthToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const apiBase = getSettingsApiBase();
      const response = await fetch(`${apiBase}/api/admin/storage`, { headers });
      if (response.ok) {
        setStorageInfo(await response.json());
      }
    } catch {
      /* not admin or not available */
    }
  }

  const savedPath = await getSetting('auto-export-path');
  if (savedPath) {
    setAutoExportPath(savedPath);
    setAutoExportEnabled(true);
  }
}

async function collectLocalExportData() {
  const base = getSettingsApiBase();
  if (base && getPlatform() !== 'tauri') {
    const token = getAuthToken();
    const headers: HeadersInit = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${base}/api/export/json`, { headers });
    if (!response.ok) throw new Error(`Export failed: ${response.status}`);
    return await response.json();
  }

  const store = getDataStore();
  const allSettings = await store.getAllSettings();
  const tasks = await store.getAllTasks();
  const streamEntries = await store.getRecentStream(365 * 10);

  return buildBackupPayload({
    tasks,
    streamEntries,
    settings: allSettings,
    platform: getPlatform(),
  });
}

async function fetchExportPayload(format: 'json' | 'markdown') {
  if (isNativeClient()) {
    return await collectLocalExportData();
  }

  const token = getAuthToken();
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const apiBase = getSettingsApiBase();
  const response = await fetch(`${apiBase}/api/export/${format}`, { headers });
  if (!response.ok) throw new Error(`Export failed: ${response.status}`);
  return await response.json();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadZipExport(data: unknown, format: 'json' | 'markdown', dateSuffix: string) {
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

  downloadBlob(
    await zip.generateAsync({ type: 'blob' }),
    `my-little-todo-${format}-${dateSuffix}-v${APP_VERSION}.zip`,
  );
}

function downloadJsonExport(data: unknown, dateSuffix: string) {
  const withMeta = {
    ...(data as Record<string, unknown>),
    _meta: { version: APP_VERSION, exported_at: new Date().toISOString() },
  };
  downloadBlob(
    new Blob([JSON.stringify(withMeta, null, 2)], { type: 'application/json' }),
    `my-little-todo-export-${dateSuffix}-v${APP_VERSION}.json`,
  );
}

function getLegacyImportMessage(t: Translate) {
  return t(
    'This backup uses the old file-based format. Please migrate with the migration tool or re-export from a current app version.',
  );
}

function getBlobImportMessage(t: Translate) {
  return t(
    'This backup contains attachments. Please restore it through the server import path first to avoid losing blob data.',
  );
}

function formatImportSummary(t: Translate, tasks: number, stream: number, settingsCount: number) {
  return t(
    'Import succeeded: {{tasks}} tasks, {{stream}} stream entries, {{settingsCount}} settings',
    {
      tasks,
      stream,
      settingsCount,
    },
  );
}

async function importPayloadToLocalStore(payload: BackupPayload) {
  return importPayloadToStore(getDataStore(), payload);
}

async function importPayloadToServer(payload: BackupPayload) {
  const token = getAuthToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const apiBase = getSettingsApiBase();
  const response = await fetch(`${apiBase}/api/import/json`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      return { ok: false as const, message: JSON.parse(text).error ?? text };
    } catch {
      return { ok: false as const, message: text || `HTTP ${response.status}` };
    }
  }

  return { ok: true as const, result: await response.json() };
}

async function reloadCoreData() {
  await Promise.all([
    useStreamStore.getState().load(),
    useTaskStore.getState().load(),
    useRoleStore.getState().load(),
    useTimeAwarenessStore.getState().load(),
    useShortcutStore.getState().load(),
  ]);
}

async function exportToServerFolder(dir: string) {
  const token = getAuthToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${getSettingsApiBase()}/api/export/disk`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ path: dir }),
  });

  if (response.ok) {
    return { ok: true as const, data: await response.json() };
  }

  const text = await response.text();
  try {
    return { ok: false as const, message: JSON.parse(text).error ?? text };
  } catch {
    return { ok: false as const, message: text || `HTTP ${response.status}` };
  }
}

function DataTab() {
  const { t } = useTranslation('settings');
  const [storageInfo, setStorageInfo] = useState<DataTabStorageInfo | null>(null);
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
    void loadDataTabInitialState(setStorageInfo, setAutoExportPath, setAutoExportEnabled);
  }, []);

  const isTauriDataTab = canExportToFolder();
  const showToast = useToastStore((s) => s.showToast);

  const handleExport = async (format: 'json' | 'markdown', asZip = false) => {
    setExporting(format);
    try {
      const data = await fetchExportPayload(format);
      const dateSuffix = new Date().toISOString().slice(0, 10);
      if (format === 'markdown' || asZip) {
        await downloadZipExport(data, format, dateSuffix);
      } else {
        downloadJsonExport(data, dateSuffix);
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
      const payload = await parseImportPayload(file);

      if (isLegacyBackupPayload(payload)) {
        setImportIsError(true);
        setImportResult(getLegacyImportMessage(t));
      } else if (isNativeClient() && (payload.blobs?.length ?? 0) > 0) {
        setImportIsError(true);
        setImportResult(getBlobImportMessage(t));
      } else if (isNativeClient()) {
        const result = await importPayloadToLocalStore(payload);
        setImportIsError(false);
        setImportResult(
          formatImportSummary(
            t,
            result.tasksImported,
            result.streamImported,
            result.settingsImported,
          ),
        );
      } else {
        const response = await importPayloadToServer(payload);
        if (!response.ok) {
          setImportIsError(true);
          setImportResult(t('Error: {{message}}', { message: response.message }));
        } else {
          setImportIsError(false);
          setImportResult(
            formatImportSummary(
              t,
              response.result.tasks_imported ?? 0,
              response.result.stream_imported ?? 0,
              response.result.settings_imported ?? 0,
            ),
          );
        }
      }

      await reloadCoreData();
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

  const handleExportToFolder = async () => {
    const dir = window.prompt(
      t('Select export folder'),
      'C:\\Users\\me\\Documents\\my-little-todo-export',
    );
    if (!dir) return;

    setExporting('markdown');
    try {
      const response = await exportToServerFolder(dir);
      if (response.ok) {
        setFullExportIsError(false);
        setFullExportResult(
          t('Exported {{count}} files to folder', { count: response.data.files_exported }),
        );
      } else {
        setFullExportIsError(true);
        setFullExportResult(t('Export failed: {{message}}', { message: response.message }));
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
          t(
            'Migration succeeded: {{tasks}} tasks, {{stream}} stream entries, {{settingsCount}} settings. {{message}}',
            {
              tasks: data.tasks_migrated ?? 0,
              stream: data.stream_migrated ?? 0,
              settingsCount: data.settings_migrated,
              message: data.message,
            },
          ),
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
    mongodb: 'MongoDB',
  };

  const native = isNativeClient();

  return (
    <div className="flex flex-col gap-6">
      {/* Server storage info */}
      {!native && storageInfo && (
        <section className="settings-card settings-card--compact">
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Current Storage')}</h3>
          </div>

          <div className="space-y-3">
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
            <div className="settings-info-row text-xs text-[var(--color-text-secondary)]">
              <span>
                {t('Backend Type')}:{' '}
                <strong>{dbLabel[storageInfo.db_type ?? ''] ?? storageInfo.db_type}</strong>
              </span>
              <span>
                {t('Auth Provider')}: <strong>{storageInfo.auth_provider ?? 'embedded'}</strong>
              </span>
            </div>
            {!storageInfo.admin_export_enabled && (
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Server-side folder export is disabled until the admin configures
                `ADMIN_EXPORT_DIRS`.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Native local storage info */}
      {native && (
        <section className="settings-card settings-card--compact">
          <div className="flex items-center gap-2 mb-3">
            <HardDriveDownload size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Current Storage')}</h3>
          </div>
          <div className="settings-info-row text-xs text-[var(--color-text-secondary)]">
            <span>
              {t('Backend Type')}: <strong>SQLite</strong>
            </span>
            <span>
              {t('Auth Provider')}: <strong>local</strong>
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
              onClick={handleExportToFolder}
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
      {!native && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Database size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Data Migration')}</h3>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
            {t(
              'Copy data from the current storage backend to another. Migration does not auto-switch; you need to update the config file (config.toml / .env) and restart.',
            )}
          </p>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="migration-target"
                className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block"
              >
                {t('Target Backend')}
              </label>
              <select
                id="migration-target"
                value={migrateTarget}
                onChange={(e) => setMigrateTarget(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
              >
                <option value="">{t('Select target type...')}</option>
                <option value="sqlite">SQLite</option>
                <option value="postgres">PostgreSQL</option>
              </select>
            </div>

            {migrateTarget && (
              <>
                <div>
                  <label
                    htmlFor="migration-dir"
                    className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block"
                  >
                    {t('Target data directory (optional, leave empty to use current)')}
                  </label>
                  <input
                    id="migration-dir"
                    type="text"
                    value={migrateDir}
                    onChange={(e) => setMigrateDir(e.target.value)}
                    placeholder="./data-new"
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>

                {migrateTarget === 'postgres' && (
                  <div>
                    <label
                      htmlFor="migration-db-url"
                      className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block"
                    >
                      {t('Database Connection URL')}
                    </label>
                    <input
                      id="migration-db-url"
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
      )}

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
              <ToggleSwitch
                checked={autoExportEnabled}
                onChange={async (v) => {
                  if (!v) {
                    setAutoExportSaving(true);
                    await deleteSetting('auto-export-path');
                    setAutoExportEnabled(false);
                    setAutoExportPath('');
                    setAutoExportSaving(false);
                  } else {
                    setAutoExportEnabled(true);
                  }
                }}
              />
            </div>

            {autoExportEnabled && (
              <>
                <div>
                  <label
                    htmlFor="continuous-export-dir"
                    className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block"
                  >
                    {t('Export Directory')}
                  </label>
                  <input
                    id="continuous-export-dir"
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

function WebApiRealtimeSyncSection() {
  const { t } = useTranslation('settings');
  const [clearing, setClearing] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState('');

  const handleClearLegacySync = useCallback(async () => {
    setClearing(true);
    setCleanupMessage('');
    try {
      await Promise.all([
        deleteSetting('sync-provider'),
        deleteSetting('sync-config'),
        deleteSetting('sync-interval'),
        deleteSetting('sync-conflict-strategy'),
        deleteSetting('sync-indicator-style'),
      ]);
      setCleanupMessage(
        t(
          'Legacy sync settings cleared. Future sync state will come from the shared backend only.',
        ),
      );
    } catch (error) {
      setCleanupMessage(
        t('Error: {{message}}', {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setClearing(false);
    }
  }, [t]);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <Cloud size={16} className="text-[var(--color-accent)]" />
        <h3 className="text-sm font-bold text-[var(--color-text)]">{t('Hosted Runtime')}</h3>
      </div>
      <p className="text-xs text-[var(--color-text-tertiary)]">
        {t(
          'Web clients in hosted mode use the current My Little Todo server directly as their runtime backend.',
        )}
      </p>
      <p className="text-xs text-[var(--color-text-tertiary)]">
        {t(
          'Cloud sync providers are configured on native clients only. If this hosted deployment still has old native sync settings stored, you can clear them here.',
        )}
      </p>
      <button
        type="button"
        onClick={() => void handleClearLegacySync()}
        disabled={clearing}
        className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
      >
        {clearing ? t('Saving...') : t('Clear Legacy Sync Settings')}
      </button>
      {cleanupMessage ? (
        <p className="text-xs text-[var(--color-text-secondary)]">{cleanupMessage}</p>
      ) : null}
    </section>
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
        await probeMltServer(getSettingsApiBase(), createHttpClient());
        setServerRunning(true);
      } catch {
        /* server not reachable */
      }
    })();
  }, []);

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMsg('');
    try {
      const data = await probeMltServer(getSettingsApiBase(), createHttpClient());
      setTestStatus('success');
      setTestMsg(
        t('Connection successful — {{details}}', {
          details: [data.db, data.auth].filter(Boolean).join(' ').trim() || 'ok',
        }),
      );
    } catch (err) {
      setTestStatus('error');
      const message = err instanceof Error ? err.message : String(err);
      if (/failed to fetch/i.test(message) && isCrossOriginApiBase(getSettingsApiBase())) {
        setTestMsg(
          t('Cross-origin request blocked. Add {{origin}} to CORS_ALLOWED_ORIGINS on the server.', {
            origin: window.location.origin,
          }),
        );
        return;
      }
      setTestMsg(mapApiError(message || t('Connection failed')));
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
            {t('Data is stored locally in SQLite. Cloud sync is configured separately from the app runtime.')}
          </p>
        </section>
      ) : (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Cloud size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">
              {t('Backend Connection')}
            </h3>
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

            {canEditBackendUrl() && platform === 'web-standalone' && (
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

      {native ? <CloudSyncSection /> : <WebApiRealtimeSyncSection />}
    </div>
  );
}

export function ApiTokenSection() {
  return null;
}

export function CloudSyncSection() {
  const { t } = useTranslation('settings');
  const [provider, setProvider] = useState<'' | 'api-server' | 'webdav'>('');
  const [apiAuthMode, setApiAuthMode] = useState<'token' | 'credentials'>('credentials');
  const [config, setConfig] = useState({
    endpoint: '',
    token: '',
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
    void (async () => {
      try {
        const store = getDataStore();
        const savedProvider = await store.getSetting('sync-provider');
        if (savedProvider === 'api-server' || savedProvider === 'webdav') {
          setProvider(savedProvider);
        }

        const rawConfig = await store.getSetting('sync-config');
        if (rawConfig) {
          try {
            const parsed = JSON.parse(rawConfig) as Record<string, string>;
            setConfig((prev) => ({
              ...prev,
              endpoint: parsed.endpoint ?? '',
              token: parsed.token ?? '',
              username: parsed.username ?? '',
              password: parsed.password ?? '',
            }));
            if (parsed.auth_mode === 'token' || parsed.auth_mode === 'credentials') {
              setApiAuthMode(parsed.auth_mode);
            }
          } catch {
            /* ignore malformed saved config */
          }
        }

        const interval = await store.getSetting('sync-interval');
        if (interval) setSyncInterval(interval);

        const strategy = await store.getSetting('sync-conflict-strategy');
        if (strategy === 'lww' || strategy === 'manual') {
          setConflictStrategy(strategy);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    const engine = getSyncEngine();
    const unsubscribe = engine.onStateChange((states) => {
      const allStates = Array.from(states.values());
      if (allStates.length === 0) {
        setLastSyncAt(0);
        return;
      }
      setLastSyncAt(Math.max(...allStates.map((state) => state.lastSyncAt)));
    });

    const currentStates = engine.getAllStates();
    if (currentStates.length > 0) {
      setLastSyncAt(Math.max(...currentStates.map((state) => state.lastSyncAt)));
    }

    return unsubscribe;
  }, []);

  const handleSave = async () => {
    if (!provider) return;

    setSaving(true);
    setStatus('');
    try {
      const store = getDataStore();
      const nextConfig: Record<string, string> = { endpoint: config.endpoint.trim() };
      if (provider === 'api-server') {
        nextConfig.auth_mode = apiAuthMode;
        if (apiAuthMode === 'token') {
          if (config.token.trim()) nextConfig.token = config.token.trim();
        } else {
          nextConfig.username = config.username;
          nextConfig.password = config.password;
        }
      } else {
        nextConfig.username = config.username;
        nextConfig.password = config.password;
      }

      await store.putSetting('sync-provider', provider);
      await store.putSetting('sync-config', JSON.stringify(nextConfig));
      await store.putSetting('sync-interval', syncInterval);
      await store.putSetting('sync-conflict-strategy', conflictStrategy);
      await initSyncFromConfig();
      setStatus(t('Configuration Saved'));
    } catch (error) {
      setStatus(
        t('Save failed: {{message}}', {
          message: error instanceof Error ? error.message : String(error),
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
      if (!engine.hasTargets()) {
        setSyncStatus(t('No sync target configured'));
        return;
      }

      await engine.syncAll();
      const firstError = engine.getFirstError();
      setSyncStatus(
        firstError ? t('Sync failed: {{message}}', { message: firstError }) : t('Sync completed'),
      );
    } catch (error) {
      setSyncStatus(
        t('Sync failed: {{message}}', {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setStatus('');
    try {
      const store = getDataStore();
      await Promise.all([
        store.deleteSetting('sync-provider'),
        store.deleteSetting('sync-config'),
        store.deleteSetting('sync-interval'),
        store.deleteSetting('sync-conflict-strategy'),
      ]);
      await initSyncFromConfig();
      setProvider('');
      setConfig({
        endpoint: '',
        token: '',
        username: '',
        password: '',
      });
      setStatus(t('Sync configuration cleared'));
    } catch (error) {
      setStatus(
        t('Save failed: {{message}}', {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setSaving(false);
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
          'Sync data across devices via an API server or WebDAV. Configure a sync target and interval below.',
        )}
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="sync-provider" className={labelClass}>
            {t('Sync Provider')}
          </label>
          <select
            id="sync-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as '' | 'api-server' | 'webdav')}
            className={inputClass}
          >
            <option value="">{t('Not Configured')}</option>
            <option value="api-server">{t('API Server (My Little Todo)')}</option>
            <option value="webdav">{t('WebDAV')}</option>
          </select>
        </div>

        {provider === 'api-server' ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="sync-server-url" className={labelClass}>
                {t('Server URL')}
              </label>
              <input
                id="sync-server-url"
                type="url"
                value={config.endpoint}
                onChange={(event) => setConfig({ ...config, endpoint: event.target.value })}
                placeholder="https://your-server.com"
                className={inputClass}
              />
            </div>
            <div>
              <p className={labelClass}>{t('Authentication Mode')}</p>
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
                  <label htmlFor="sync-api-username" className={labelClass}>
                    {t('Username')}
                  </label>
                  <input
                    id="sync-api-username"
                    type="text"
                    value={config.username}
                    onChange={(event) => setConfig({ ...config, username: event.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="sync-api-password" className={labelClass}>
                    {t('Password')}
                  </label>
                  <input
                    id="sync-api-password"
                    type="password"
                    value={config.password}
                    onChange={(event) => setConfig({ ...config, password: event.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor="sync-api-token" className={labelClass}>
                  {t('Token / API Key')}
                </label>
                <input
                  id="sync-api-token"
                  type="password"
                  value={config.token}
                  onChange={(event) => setConfig({ ...config, token: event.target.value })}
                  placeholder={t('Paste JWT or long-lived API token')}
                  className={inputClass}
                />
              </div>
            )}
          </div>
        ) : null}

        {provider === 'webdav' ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="sync-webdav-url" className={labelClass}>
                {t('WebDAV URL')}
              </label>
              <input
                id="sync-webdav-url"
                type="url"
                value={config.endpoint}
                onChange={(event) => setConfig({ ...config, endpoint: event.target.value })}
                placeholder="https://dav.example.com/sync/"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="sync-webdav-username" className={labelClass}>
                  {t('Username (Optional)')}
                </label>
                <input
                  id="sync-webdav-username"
                  type="text"
                  value={config.username}
                  onChange={(event) => setConfig({ ...config, username: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="sync-webdav-password" className={labelClass}>
                  {t('Password (Optional)')}
                </label>
                <input
                  id="sync-webdav-password"
                  type="password"
                  value={config.password}
                  onChange={(event) => setConfig({ ...config, password: event.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        ) : null}

        {provider ? (
          <>
            <hr style={{ borderColor: 'var(--color-border)' }} />
            <div>
              <label htmlFor="sync-interval" className={labelClass}>
                {t('Sync Interval')}
              </label>
              <select
                id="sync-interval"
                value={syncInterval}
                onChange={(event) => setSyncInterval(event.target.value)}
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

            <div className="flex items-center justify-between gap-3">
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
              <ToggleSwitch
                checked={conflictStrategy === 'lww'}
                onChange={(value) => setConflictStrategy(value ? 'lww' : 'manual')}
              />
            </div>

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
              <button
                type="button"
                onClick={handleClear}
                disabled={saving}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
              >
                {t('Clear')}
              </button>
            </div>
          </>
        ) : null}

        {lastSyncAt > 0 ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {t('Last synced')}: {new Date(lastSyncAt).toLocaleString()}
          </p>
        ) : null}
        {status ? <p className="text-xs text-[var(--color-text-secondary)]">{status}</p> : null}
        {syncStatus ? (
          <p className="text-xs text-[var(--color-text-secondary)]">{syncStatus}</p>
        ) : null}
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
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
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
              <Loader2
                size={12}
                className="animate-spin"
                style={{ color: 'var(--color-accent)' }}
              />
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
          <div
            className="mb-4 flex items-center gap-2 rounded-lg p-2.5"
            style={{
              background: 'color-mix(in srgb, var(--color-success, #22c55e) 10%, transparent)',
            }}
          >
            <CheckCircle size={16} style={{ color: 'var(--color-success, #22c55e)' }} />
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--color-success, #22c55e)' }}
            >
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
  const [openSourceOpen, setOpenSourceOpen] = useState(false);

  const handleCheckUpdate = useCallback(
    async (silent = false) => {
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
          const isNetwork =
            msg.includes('fetch') ||
            msg.includes('network') ||
            msg.includes('JSON') ||
            msg.includes('404');
          showToast({
            type: 'error',
            message: isNetwork
              ? t('Unable to reach update server. Please check your network or try again later.')
              : t('Update check failed: {{message}}', { message: msg }),
          });
        }
      }
      localStorage.setItem('mlt-last-update-check', String(Date.now()));
    },
    [showToast, t, tauri],
  );

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

      <a
        href="https://github.com/X-T-E-R/my-little-todo"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 mt-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors w-fit"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)',
        }}
      >
        <Github size={16} className="text-[var(--color-text)]" />
        {t('Source code on GitHub')}
        <ExternalLink size={12} className="text-[var(--color-text-tertiary)]" />
      </a>

      <div
        className="mt-2 rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        <button
          type="button"
          onClick={() => setOpenSourceOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-expanded={openSourceOpen}
        >
          <span>{t('Open source & licenses')}</span>
          <ChevronDown
            size={18}
            className="shrink-0 transition-transform text-[var(--color-text-tertiary)]"
            style={{ transform: openSourceOpen ? 'rotate(180deg)' : undefined }}
          />
        </button>
        {openSourceOpen && (
          <div
            className="px-4 pb-4 pt-0 text-xs leading-relaxed space-y-3"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <p>
              {t('App license')}: MIT — {t('See LICENSE in the repository root.')}
            </p>
            <p className="font-medium text-[var(--color-text-secondary)]">
              {t('Third-party libraries (runtime)')}
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>React, react-dom (MIT)</li>
              <li>Zustand (MIT)</li>
              <li>framer-motion (MIT)</li>
              <li>@dnd-kit/core, @dnd-kit/utilities (MIT)</li>
              <li>i18next, react-i18next (MIT)</li>
              <li>marked (MIT)</li>
              <li>lucide-react (ISC)</li>
              <li>jszip (MIT / GPL-3.0 dual — see package)</li>
              <li>@tauri-apps/api & plugins (Apache-2.0 / MIT)</li>
              <li>Tailwind CSS (MIT)</li>
            </ul>
            <p className="text-[10px] opacity-80">
              {t('Exact versions are listed in package.json.')}
            </p>
          </div>
        )}
      </div>

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
                {updateStatus === 'checking'
                  ? t('Checking for updates...')
                  : t('Check for Updates')}
              </button>
            </div>

            <div className="flex items-center gap-2 select-none">
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
            </div>
          </div>
        </div>
      )}

      {showUpdateDialog &&
        (updateStatus === 'available' ||
          updateStatus === 'downloading' ||
          updateStatus === 'ready') && (
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

      {/* API Usage Statistics (placeholder) */}
      {!nativeAi && (
        <>
          <hr style={{ borderColor: 'var(--color-border)' }} />
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
        </>
      )}
    </div>
  );
}

/* ── Shared Components ── */

const TAB_CONTENT: Record<BaseSettingsTab, () => React.JSX.Element> = {
  general: GeneralTab,
  account: AccountTab,
  ai: AiTab,
  shortcuts: ShortcutsTab,
  sync: SyncTab,
  data: DataTab,
  plugins: PluginsTab,
  about: AboutTab,
};

function renderActiveSettingsTab(tab: SettingsTab): React.ReactNode {
  if (tab.startsWith('module:')) {
    const id = tab.slice('module:'.length);
    return <SettingsEntryHost source="builtin" entryId={id} />;
  }
  if (tab.startsWith('plugin:')) {
    const id = tab.slice('plugin:'.length);
    return <SettingsEntryHost source="plugin" entryId={id} />;
  }
  const C = TAB_CONTENT[tab as BaseSettingsTab];
  return C ? <C /> : <GeneralTab />;
}

function getSettingsHeading(
  tab: SettingsTab,
  t: (k: string) => string,
  pluginHeadingNames: Record<string, string>,
): string {
  if (tab.startsWith('module:')) {
    const id = tab.slice('module:'.length);
    const mod = BUILT_IN_MODULES.find((m) => m.id === id);
    return mod ? t(mod.nameKey) : '';
  }
  if (tab.startsWith('plugin:')) {
    const id = tab.slice('plugin:'.length);
    if (pluginHeadingNames[id]) return pluginHeadingNames[id];
    return id;
  }
  const all = [...PRIMARY_TABS, ABOUT_TAB];
  const found = all.find((x) => x.id === tab);
  return found ? t(found.label) : '';
}

function getSettingsSummary(
  tab: SettingsTab,
  t: (k: string) => string,
  pluginHeadingNames: Record<string, string>,
): string {
  const zh = i18n.language.startsWith('zh');
  if (tab === 'general')
    return zh
      ? '主题、语言与日常默认项。'
      : 'Theme, language, and the everyday defaults that shape the app.';
  if (tab === 'account')
    return zh
      ? '账号状态、个人偏好与账户相关操作。'
      : 'Authentication status, profile-level preferences, and account links.';
  if (tab === 'ai')
    return zh
      ? 'AI 能力入口、提供方与助手行为。'
      : 'AI capability toggles, providers, and assistant-related behavior.';
  if (tab === 'shortcuts')
    return zh ? '键盘映射与高频操作捷径。' : 'Keyboard mappings and quick control affordances.';
  if (tab === 'sync')
    return zh
      ? '同步目标、冲突处理与数据流转状态。'
      : 'Sync backend, conflict behavior, and data movement status.';
  if (tab === 'data')
    return zh
      ? '备份、导入导出与本地存储管理。'
      : 'Backups, imports, exports, and local storage operations.';
  if (tab === 'plugins')
    return zh
      ? '启停模块、查看来源，并确认哪些模块有额外设置。'
      : 'Enable modules, inspect plugin origin, and see whether extra settings exist.';
  if (tab === 'about')
    return zh
      ? '版本、更新检查与产品信息。'
      : 'Version info, update checks, and product references.';
  if (tab.startsWith('module:')) {
    return zh
      ? '通过统一设置注册表接入的模块专属配置。'
      : 'Module-specific controls registered through the unified settings registry.';
  }
  if (tab.startsWith('plugin:')) {
    const id = tab.slice('plugin:'.length);
    return zh
      ? `${pluginHeadingNames[id] ?? id} 通过当前插件注册表暴露的设置项。`
      : `${pluginHeadingNames[id] ?? id} settings exposed by the active plugin registry.`;
  }
  return t('Settings');
}

/* ── Main Settings View ── */

export function SettingsView() {
  ensureBuiltinSettingsRegistered();
  const { t } = useTranslation('settings');
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [, setSettingsRegistryVersion] = useState(0);
  const isMobile = useIsMobile();
  const authMode = useAuthStore((s) => s.authMode);
  const showShortcuts = hasKeyboardShortcuts();
  const moduleEnabled = useModuleStore((s) => s.enabled);
  const installedPlugins = usePluginStore((s) => s.plugins);

  useEffect(() => subscribeSettingsRegistry(() => setSettingsRegistryVersion((v) => v + 1)), []);

  const pluginAppModules = useMemo(
    () => installedPluginsToAppModules(installedPlugins),
    [installedPlugins],
  );
  const registeredSettingsEntries = getSettingsEntries();

  const pluginHeadingNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of pluginAppModules) {
      if (m.pluginDisplayName) map[m.id] = m.pluginDisplayName;
    }
    return map;
  }, [pluginAppModules]);

  const allTabs = [...PRIMARY_TABS, ABOUT_TAB].filter((tab) => {
    if (tab.id === 'shortcuts' && !showShortcuts) return false;
    if (tab.id === 'account' && !authMode) return false;
    return true;
  });

  const moduleSettingsTabs: NavTab[] = useMemo(
    () =>
      registeredSettingsEntries
        .filter((entry) => entry.source === 'builtin')
        .flatMap((entry) => {
          const mod = BUILT_IN_MODULES.find((candidate) => candidate.id === entry.id);
          if (!mod) return [];
          if (!(moduleEnabled[mod.id] ?? mod.defaultEnabled)) return [];
          return [
            {
              id: `module:${mod.id}` as SettingsTab,
              label: mod.nameKey,
              icon: PLUGIN_ICONS[mod.id] ?? Info,
              rawLabel: false as boolean | undefined,
            },
          ];
        }),
    [moduleEnabled, registeredSettingsEntries],
  );

  const thirdPartySettingsTabs: NavTab[] = useMemo(
    () =>
      registeredSettingsEntries
        .filter((entry) => entry.source === 'plugin')
        .flatMap((entry) => {
          const plugin = pluginAppModules.find((candidate) => candidate.id === entry.id);
          if (!plugin) return [];
          if (!(moduleEnabled[plugin.id] ?? plugin.defaultEnabled)) return [];
          return [
            {
              id: `plugin:${plugin.id}` as SettingsTab,
              label: plugin.pluginDisplayName ?? plugin.id,
              icon: LayoutGrid,
              rawLabel: true as boolean | undefined,
            },
          ];
        }),
    [moduleEnabled, pluginAppModules, registeredSettingsEntries],
  );

  useEffect(() => {
    if (activeTab.startsWith('module:')) {
      const id = activeTab.slice('module:'.length);
      if (!moduleSettingsTabs.some((tab) => tab.id === activeTab)) {
        const fallback = BUILT_IN_MODULES.find((mod) => mod.id === id);
        if (!fallback || !(moduleEnabled[id] ?? fallback.defaultEnabled)) {
          setActiveTab('plugins');
        }
      }
    }
    if (
      activeTab.startsWith('plugin:') &&
      !thirdPartySettingsTabs.some((tab) => tab.id === activeTab)
    ) {
      setActiveTab('plugins');
    }
  }, [activeTab, moduleEnabled, moduleSettingsTabs, thirdPartySettingsTabs]);

  const heading = getSettingsHeading(activeTab, t, pluginHeadingNames);
  const summary = getSettingsSummary(activeTab, t, pluginHeadingNames);
  const appTabs = allTabs.filter((tab) => tab.id !== 'plugins');
  const managementTabs = allTabs.filter((tab) => tab.id === 'plugins');
  const contentWidthClass =
    activeTab === 'plugins'
      ? 'max-w-[82rem]'
      : activeTab.startsWith('module:') || activeTab.startsWith('plugin:')
        ? 'max-w-[74rem]'
        : 'max-w-[68rem]';

  const renderNavButton = (tab: NavTab, mobile = false) => {
    const Icon = tab.icon;
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => setActiveTab(tab.id)}
        className={
          mobile
            ? 'shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors select-none outline-none'
            : 'flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors text-left select-none outline-none shrink-0'
        }
        style={{
          background: isActive ? 'var(--color-accent-soft)' : 'transparent',
          color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        }}
      >
        <Icon size={mobile ? 14 : 16} />
        {tab.rawLabel ? tab.label : t(tab.label)}
      </button>
    );
  };

  const renderSectionLabel = (label: string, mobile = false) => (
    <div
      className={
        mobile
          ? 'shrink-0 px-1 text-[10px] font-semibold uppercase tracking-[0.18em]'
          : 'px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em]'
      }
      style={{ color: 'var(--color-text-tertiary)' }}
    >
      {label}
    </div>
  );

  return (
    <SettingsNavContext.Provider value={{ setActiveTab }}>
      <div className={`flex h-full bg-[var(--color-bg)] ${isMobile ? 'flex-col' : ''}`}>
        {isMobile ? (
          <div
            className="flex items-center gap-3 px-2 pt-2 pb-1 overflow-x-auto shrink-0"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center gap-1.5">
              {renderSectionLabel(t('General'), true)}
              {appTabs.map((tab) => renderNavButton(tab, true))}
            </div>
            <div
              className="flex items-center gap-1.5 border-l pl-3"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {renderSectionLabel(t('Modules'), true)}
              {managementTabs.map((tab) => renderNavButton(tab, true))}
              {moduleSettingsTabs.map((tab) => renderNavButton(tab, true))}
            </div>
            {thirdPartySettingsTabs.length > 0 && (
              <div
                className="flex items-center gap-1.5 border-l pl-3"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {renderSectionLabel(t('Installed plugins'), true)}
                {thirdPartySettingsTabs.map((tab) => renderNavButton(tab, true))}
              </div>
            )}
          </div>
        ) : (
          <nav
            className="flex flex-col gap-1 py-8 px-3 shrink-0 overflow-y-auto"
            style={{ width: '236px', borderRight: '1px solid var(--color-border)' }}
          >
            <h1
              className="px-3 mb-4 text-lg font-bold shrink-0"
              style={{ color: 'var(--color-text)' }}
            >
              {t('Settings')}
            </h1>

            {renderSectionLabel(t('General'))}
            {appTabs.map((tab) => renderNavButton(tab))}
            <hr className="my-2 border-[var(--color-border)]" />
            {renderSectionLabel(t('Modules'))}
            {managementTabs.map((tab) => renderNavButton(tab))}
            {moduleSettingsTabs.map((tab) => renderNavButton(tab))}
            {thirdPartySettingsTabs.length > 0 && (
              <>
                <hr className="my-2 border-[var(--color-border)]" />
                {renderSectionLabel(t('Installed plugins'))}
                {thirdPartySettingsTabs.map((tab) => renderNavButton(tab))}
              </>
            )}
          </nav>
        )}

        <div className={`flex-1 overflow-y-auto ${isMobile ? 'px-4 py-4' : 'px-6 py-7'}`}>
          <div className={contentWidthClass}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
              className="settings-page-shell space-y-3"
            >
              <header
                className="settings-page-header rounded-[var(--radius-panel)] border px-5 py-3.5"
                style={{
                  borderColor: 'var(--color-border)',
                  background: 'color-mix(in srgb, var(--color-surface) 94%, var(--color-bg))',
                }}
              >
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {activeTab.startsWith('module:') || activeTab.startsWith('plugin:')
                    ? i18n.language.startsWith('zh')
                      ? '模块设置'
                      : 'Module settings'
                    : t('Settings')}
                </p>
                <h2 className="mt-1.5 text-[17px] font-bold" style={{ color: 'var(--color-text)' }}>
                  {heading}
                </h2>
                <p
                  className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {summary}
                </p>
              </header>
              <div className="settings-page-content">{renderActiveSettingsTab(activeTab)}</div>
            </motion.div>
          </div>
        </div>
      </div>
    </SettingsNavContext.Provider>
  );
}
