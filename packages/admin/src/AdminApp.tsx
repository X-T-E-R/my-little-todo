import { Activity, Globe, Key, LogOut, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
  auth_mode: string;
}

interface UserItem {
  id: string;
  username: string;
  is_admin: boolean;
  created_at: string;
}

type Page = 'dashboard' | 'users';

function LanguageSelector() {
  const { i18n } = useTranslation();
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lng = e.target.value;
    i18n.changeLanguage(lng);
    localStorage.setItem('language', lng);
  };
  return (
    <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
      <Globe size={14} />
      <select
        value={i18n.language}
        onChange={handleChange}
        aria-label="Language"
        className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs outline-none"
      >
        <option value="zh-CN">中文</option>
        <option value="en">English</option>
      </select>
    </div>
  );
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const { t } = useTranslation('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login(username, password);
      api.setToken(data.token);
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
        <h1 className="mb-6 text-center text-xl font-semibold">{t('Admin Login')}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('Admin Username')}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('Password')}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--color-accent)] py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? t('Logging in...') : t('Login')}
          </button>
        </form>
      </div>
    </div>
  );
}

function Dashboard({ stats }: { stats: Stats | null }) {
  const { t } = useTranslation('admin');
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('Dashboard')}</h2>
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label={t('Total Users')} value={String(stats.total_users)} icon={<Users size={18} />} />
          <StatCard label={t('Database Type')} value={stats.db_type} icon={<Activity size={18} />} />
          <StatCard label={t('Auth Mode')} value={stats.auth_mode} icon={<Key size={18} />} />
        </div>
      )}
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

function UsersPage() {
  const { t } = useTranslation('admin');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPw, setNewPw] = useState('');
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch {
      /* empty */
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(t('Confirm delete user {{username}}?', { username }))) return;
    try {
      await api.deleteUser(id);
      loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleReset = async (id: string) => {
    if (!newPw) return;
    try {
      await api.resetPassword(id, newPw);
      setResetId(null);
      setNewPw('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('User Management')}</h2>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">{t('Username')}</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">{t('Role')}</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">{t('Created At')}</th>
              <th className="px-4 py-3 text-right font-medium text-[var(--color-text-secondary)]">{t('Actions')}</th>
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
                          onClick={() => { setResetId(null); setNewPw(''); }}
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

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      setChecking(false);
      return;
    }
    api
      .getMe()
      .then((u) => {
        if (!u.is_admin) {
          api.clearToken();
          setChecking(false);
          return;
        }
        setUser(u);
        setAuthed(true);
        setChecking(false);
      })
      .catch(() => {
        api.clearToken();
        setChecking(false);
      });
  }, []);

  useEffect(() => {
    if (!authed) return;
    api.getStats().then(setStats).catch(() => {});
  }, [authed]);

  const handleLogout = () => {
    api.clearToken();
    setAuthed(false);
    setUser(null);
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--color-text-secondary)]">{t('Loading...')}</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <LoginPage
        onLogin={() => {
          api.getMe().then((u) => {
            if (!u.is_admin) {
              api.clearToken();
              alert(t('Admin privileges required'));
              return;
            }
            setUser(u);
            setAuthed(true);
          });
        }}
      />
    );
  }

  const navItems: { key: Page; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: t('Dashboard'), icon: <Activity size={16} /> },
    { key: 'users', label: t('User Management'), icon: <Users size={16} /> },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4">
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
        {page === 'dashboard' && <Dashboard stats={stats} />}
        {page === 'users' && <UsersPage />}
      </main>
    </div>
  );
}
