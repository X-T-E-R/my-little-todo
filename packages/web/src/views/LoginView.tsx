import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, LogIn, Settings, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function LoginView() {
  const { t } = useTranslation('login');
  const { authMode, needsSetup, login, register } = useAuthStore();
  const [isRegister, setIsRegister] = useState(needsSetup && isTauri);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const serverNeedsSetup = needsSetup && !isTauri;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register(username, password);
      } else {
        await login(username, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (serverNeedsSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-4">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="w-full max-w-sm"
        >
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent)]/10">
                <Settings size={24} className="text-[var(--color-accent)]" />
              </div>
              <h1 className="text-xl font-semibold text-[var(--color-text)]">
                {t('Setup required')}
              </h1>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                {t(
                  'Please visit the admin panel to create the first admin account before using this app.',
                )}
              </p>
            </div>
            <a
              href="/admin"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <Settings size={16} />
              {t('Go to Admin Panel')}
            </a>
          </div>
        </motion.div>
      </div>
    );
  }

  const canRegister = authMode === 'multi' || needsSetup;
  const title = needsSetup ? t('Initial setup') : isRegister ? t('Create account') : t('Login');
  const subtitle = needsSetup
    ? t('Create an admin account to get started')
    : isRegister
      ? t('Register a new My Little Todo account')
      : t('Login to My Little Todo');

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-full max-w-sm"
      >
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent)]/10">
              <span className="text-xl font-bold text-[var(--color-accent)]">M</span>
            </div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">{title}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                {t('Username')}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/30"
                placeholder={t('Enter username')}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                {t('Password')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 pr-10 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/30"
                  placeholder={t('Enter password')}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : isRegister ? (
                <UserPlus size={16} />
              ) : (
                <LogIn size={16} />
              )}
              {loading ? t('Please wait...') : isRegister ? t('Register') : t('Login')}
            </button>
          </form>

          {canRegister && !needsSetup && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                }}
                className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors"
              >
                {isRegister ? t('Already have an account? Login') : t('No account? Register')}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
