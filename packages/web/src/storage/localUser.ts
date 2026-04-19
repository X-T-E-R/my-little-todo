export const LOCAL_DESKTOP_USER_ID = 'local-desktop-user';
export const LOCAL_DESKTOP_USERNAME = 'local';

export function withLocalDesktopUser<T extends unknown[]>(...values: T): [string, ...T] {
  return [LOCAL_DESKTOP_USER_ID, ...values];
}
