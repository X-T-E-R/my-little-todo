import { motion } from 'framer-motion';
import { ExternalLink, Eye, EyeOff, Loader2, LogIn, Shield, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';

export function LoginView() {
  const { t } = useTranslation('login');
  const authMode = useAuthStore((s) => s.authMode);
  const needsSetup = useAuthStore((s) => s.needsSetup);
  const signupPolicy = useAuthStore((s) => s.signupPolicy);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const login = useAuthStore((s) => s.login);
  const setup = useAuthStore((s) => s.setup);
  const register = useAuthStore((s) => s.register);

  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const modeLabel = useMemo(() => {
    if (needsSetup) {
      return {
        title: t('Initial setup'),
        subtitle: t('Create the first owner/admin account to start using this hosted server.'),
      };
    }
    if (authMode === 'external') {
      return {
        title: t('Sign in to continue'),
        subtitle: t('This app now uses {{provider}} for authentication.', {
          provider: bootstrap?.auth_provider === 'zitadel' ? 'ZITADEL' : t('identity provider'),
        }),
      };
    }
    if (isRegister) {
      return {
        title: t('Create account'),
        subtitle:
          signupPolicy === 'invite_only'
            ? t('Create a new account with an invite code from your server admin.')
            : t('Create a new My Little Todo account'),
      };
    }
    return {
      title: t('Login'),
      subtitle: t('Login to My Little Todo'),
    };
  }, [authMode, bootstrap?.auth_provider, isRegister, needsSetup, signupPolicy, t]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (needsSetup) {
        await setup(username, password);
      } else if (authMode === 'external') {
        await login();
      } else if (isRegister) {
        await register(username, password, inviteCode || undefined);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleExternalLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await login();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const canSelfRegister = !needsSetup && authMode === 'embedded' && signupPolicy !== 'admin_only';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-full max-w-md"
      >
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent)]/10">
              <Shield size={24} className="text-[var(--color-accent)]" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">{modeLabel.title}</h1>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{modeLabel.subtitle}</p>
          </div>

          {authMode === 'external' ? (
            <>
              <button
                type="button"
                onClick={() => void handleExternalLogin()}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                {loading ? t('Redirecting...') : t('Continue with {{provider}}', { provider: 'ZITADEL' })}
              </button>

              {bootstrap?.issuer ? (
                <a
                  href={bootstrap.issuer}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
                >
                  <ExternalLink size={12} />
                  {t('Open identity provider')}
                </a>
              ) : null}
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                  {t('Username')}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/30"
                  placeholder={t('Enter username')}
                  required
                  autoFocus
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
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 pr-10 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/30"
                    placeholder={t('Enter password')}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {isRegister && signupPolicy === 'invite_only' ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                    {t('Invite code')}
                  </label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/30"
                    placeholder={t('Paste invite code')}
                    required
                  />
                </div>
              ) : null}

              {signupPolicy === 'admin_only' && !needsSetup ? (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-text-secondary)]">
                  {t('This server only allows admins to create accounts. Ask your admin to add you from the admin panel.')}
                </div>
              ) : null}

              {error ? (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500"
                >
                  {error}
                </motion.div>
              ) : null}

              <button
                type="submit"
                disabled={
                  loading ||
                  !username ||
                  !password ||
                  (isRegister && signupPolicy === 'invite_only' && !inviteCode.trim())
                }
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : needsSetup || isRegister ? (
                  <UserPlus size={16} />
                ) : (
                  <LogIn size={16} />
                )}
                {loading
                  ? t('Please wait...')
                  : needsSetup
                    ? t('Create owner account')
                    : isRegister
                      ? t('Register')
                      : t('Login')}
              </button>
            </form>
          )}

          {canSelfRegister ? (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsRegister((value) => !value);
                  setError('');
                }}
                className="text-xs text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
              >
                {isRegister ? t('Already have an account? Login') : t('No account? Register')}
              </button>
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
