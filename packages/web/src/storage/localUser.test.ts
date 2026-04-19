import { describe, expect, it } from 'vitest';

import { LOCAL_DESKTOP_USER_ID, LOCAL_DESKTOP_USERNAME, withLocalDesktopUser } from './localUser';

describe('localUser', () => {
  it('pins desktop local mode to a stable pseudo-user', () => {
    expect(LOCAL_DESKTOP_USER_ID).toBe('local-desktop-user');
    expect(LOCAL_DESKTOP_USERNAME).toBe('local');
  });

  it('prepends the desktop pseudo-user to query params', () => {
    expect(withLocalDesktopUser('task-1', 42)).toEqual(['local-desktop-user', 'task-1', 42]);
  });
});
