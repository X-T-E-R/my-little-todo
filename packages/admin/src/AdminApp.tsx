import {
  Activity,
  Globe,
  Key,
  LogOut,
  ShieldPlus,
  Ticket,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from './api';

interface UserInfo {
  id: string;
  username: string;
  is_admin: boolean;
}

interface Stats {
  total_users: number;
  db_type: string;
  auth_provider: string;
}

interface UserItem {
  id: string;
  username: string;
  is_admin: boolean;
  is_enabled: boolean;
  created_at: string;
}

interface InviteItem {
  code: string;
  created_by: string;
  created_at: string;
  expires_at?: string | null;
  consumed_at?: string | null;
  consumed_by?: string | null;
}

type Page = 'dashboard' | 'users' | 'invites';

function LanguageSelector() {
  const { i18n } = useTranslation();
  return (
    <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
      <Globe size={14} />
      <select
        value={i18n.language}
        onChange={(event) => {
          const lng = event.target.value;
          i18n.changeLanguage(lng);
          localStorage.setItem('language', lng);
        }}
        aria-label="Language"
        className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs outline-none"
      >
        <option value="zh-CN">中文</option>
        <option value="en">English</option>
      </select>
    </div>
  );
}

function AccessTokenPage({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const { t } = useTranslation('admin');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      api.setToken(token.trim());
      await onAuthenticated();
    } catch (err) {
      api.clearToken();
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
        <div className="mb-4 flex justify-end">
          <LanguageSelector />
        </div>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent)]/10">
            <Key size={24} className="text-[var(--color-accent)]" />
          </div>
          <h1 className="text-xl font-semibold">{t('Admin Session Required')}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {t('Admin reuses the same bearer session as the main app.')}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
            {t('If you are already signed in through the main app, refresh this page. Otherwise paste a valid bearer token below.')}
          </p>
          <textarea
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={t('Paste Access Token')}
            className="min-h-32 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            required
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:opacity-90"
            >
              {t('Open Main App')}
            </button>
            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="flex-1 rounded-lg bg-[var(--color-accent)] py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? t('Verifying...') : t('Use Access Token')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-2 flex items-center gap-2 text-[var(--color-text-secondary)]">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function Dashboard({ stats }: { stats: Stats | null }) {
  const { t } = useTranslation('admin');
  if (!stats) return null;
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('Dashboard')}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('Total Users')} value={String(stats.total_users)} icon={<Users size={18} />} />
        <StatCard label={t('Database Type')} value={stats.db_type} icon={<Activity size={18} />} />
        <StatCard label={t('Auth Provider')} value={stats.auth_provider} icon={<Key size={18} />} />
      </div>
    </div>
  );
}

function UsersPage({ authProvider }: { authProvider: string }) {
  const { t } = useTranslation('admin');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load users failed');
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await api.createUser({ username, password, is_admin: isAdmin });
      setUsername('');
      setPassword('');
      setIsAdmin(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create user failed');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('Confirm delete user {{username}}?', { username: name }))) return;
    try {
      await api.deleteUser(id);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleToggle = async (id: string, nextEnabled: boolean) => {
    try {
      await api.setUserStatus(id, nextEnabled);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed');
    }
  };

  const handleResetPassword = async (id: string, name: string) => {
    const nextPassword = prompt(t('Enter a new password for {{username}}', { username: name }));
    if (!nextPassword) return;
    try {
      await api.resetUserPassword(id, nextPassword);
      alert(t('Password reset complete'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('User Management')}</h2>
        <span className="rounded-full bg-[var(--color-accent)]/10 px-3 py-1 text-xs text-[var(--color-accent)]">
          {authProvider}
        </span>
      </div>

      {authProvider === 'embedded' ? (
        <form
          onSubmit={handleCreate}
          className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-[1fr_1fr_auto]"
        >
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={t('Username')}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
            required
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t('Password')}
            type="password"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none"
            required
          />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} />
              {t('Admin')}
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
            >
              <ShieldPlus size={16} />
              {t('Create account')}
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-secondary)]">
          {t('Zitadel mode keeps app-level admin controls here, but external identities are managed by your OIDC provider.')}
        </div>
      )}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">{t('Username')}</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">{t('Role')}</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">{t('Status')}</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">{t('Created At')}</th>
              <th className="px-4 py-3 text-right font-medium text-[var(--color-text-secondary)]">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-3">{user.username}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      user.is_admin
                        ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]'
                        : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {user.is_admin ? t('Admin') : t('User')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      user.is_enabled
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-amber-500/10 text-amber-500'
                    }`}
                  >
                    {user.is_enabled ? t('Enabled') : t('Disabled')}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--color-text-secondary)]">{user.created_at}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {authProvider === 'embedded' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleResetPassword(user.id, user.username)}
                          className="rounded p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
                          title={t('Reset password')}
                        >
                          <UserCog size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggle(user.id, !user.is_enabled)}
                          className="rounded p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
                          title={user.is_enabled ? t('Disable user') : t('Enable user')}
                        >
                          {user.is_enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleDelete(user.id, user.username)}
                      className="rounded p-1 text-[var(--color-text-secondary)] hover:text-red-400"
                      title={t('Delete User')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvitesPage({ authProvider }: { authProvider: string }) {
  const { t } = useTranslation('admin');
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [error, setError] = useState('');

  const loadInvites = useCallback(async () => {
    try {
      const data = await api.getInvites();
      setInvites(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load invites failed');
    }
  }, []);

  useEffect(() => {
    if (authProvider !== 'embedded') return;
    void loadInvites();
  }, [authProvider, loadInvites]);

  const handleCreateInvite = async () => {
    try {
      const created = (await api.createInvite()) as InviteItem;
      await navigator.clipboard.writeText(created.code).catch(() => undefined);
      await loadInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create invite failed');
    }
  };

  if (authProvider !== 'embedded') {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-secondary)]">
        {t('Invites are only used in embedded auth mode.')}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('Invites')}</h2>
        <button
          type="button"
          onClick={() => void handleCreateInvite()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          <Ticket size={16} />
          {t('Create invite')}
        </button>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">{t('Invite code')}</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">{t('Expires At')}</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">{t('Consumed')}</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.code} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{invite.code}</td>
                <td className="px-4 py-3 text-[var(--color-text-secondary)]">{invite.expires_at ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                  {invite.consumed_at ? `${invite.consumed_at} (${invite.consumed_by ?? 'n/a'})` : t('Not used')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminApp() {
  const { t } = useTranslation('admin');
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [checking, setChecking] = useState(true);

  const loadStats = useCallback(async () => {
    const data = await api.getStats();
    setStats(data);
  }, []);

  useEffect(() => {
    const currentToken = api.getToken();
    (currentToken ? api.getMe().catch(() => null) : Promise.resolve(null))
      .then((me) => {
        if (me?.is_admin) {
          setUser(me);
          setAuthed(true);
        } else if (currentToken) {
          api.clearToken();
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!authed) return;
    void loadStats().catch(() => undefined);
  }, [authed, loadStats]);

  useEffect(() => {
    if (authed) return;
    const handleFocus = async () => {
      const existingToken = api.getToken();
      if (!existingToken) return;
      try {
        const me = await api.getMe();
        if (!me.is_admin) return;
        setUser(me);
        setAuthed(true);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [authed]);

  const handleLogout = () => {
    api.clearToken();
    setAuthed(false);
    setUser(null);
  };

  const handlePostAuth = async () => {
    const me = await api.getMe();
    if (!me.is_admin) {
      api.clearToken();
      alert(t('Admin privileges required'));
      return;
    }
    setUser(me);
    setAuthed(true);
  };

  const navItems = useMemo(
    () => [
      { key: 'dashboard' as const, label: t('Dashboard'), icon: <Activity size={16} /> },
      { key: 'users' as const, label: t('User Management'), icon: <Users size={16} /> },
      { key: 'invites' as const, label: t('Invites'), icon: <Ticket size={16} /> },
    ],
    [t],
  );

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--color-text-secondary)]">{t('Loading...')}</p>
      </div>
    );
  }

  if (!authed) {
    return <AccessTokenPage onAuthenticated={handlePostAuth} />;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-6">
          <h1 className="text-sm font-bold">MLT Admin</h1>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{user?.username}</p>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPage(item.key)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                page === item.key
                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-6">
          <LanguageSelector />
        </div>
        <div className="mt-auto pt-6">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-red-400"
          >
            <LogOut size={16} />
            {t('Log Out')}
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8">
        {page === 'dashboard' ? <Dashboard stats={stats} /> : null}
        {page === 'users' ? <UsersPage authProvider={stats?.auth_provider ?? 'embedded'} /> : null}
        {page === 'invites' ? <InvitesPage authProvider={stats?.auth_provider ?? 'embedded'} /> : null}
      </main>
    </div>
  );
}
