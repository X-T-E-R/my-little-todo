import i18n from '../locales';

const ERROR_KEYS: Set<string> = new Set([
  'File not found',
  'Invalid token',
  'Authentication required',
  'Invalid or expired token',
  'Username and password are required',
  'Username or password too long',
  'Username already taken',
  'Single-user mode: registration disabled',
  'Invalid username or password',
  'User not found',
  'Current password is incorrect',
  'Admin access required',
  'Cannot delete yourself',
  'Backup provider not configured',
  'Entry not found',
]);

export function mapApiError(error: string): string {
  if (ERROR_KEYS.has(error)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (i18n as any).t(error, { ns: 'errors' }) as string;
  }
  return error;
}
