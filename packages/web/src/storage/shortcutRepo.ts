import type { ShortcutBinding } from '../utils/shortcuts';
import { DEFAULT_SHORTCUTS } from '../utils/shortcuts';
import { getSetting, putSetting } from './settingsApi';

const SETTING_KEY = 'shortcuts';

export async function loadShortcuts(): Promise<ShortcutBinding[]> {
  const raw = await getSetting(SETTING_KEY);
  if (!raw) return [...DEFAULT_SHORTCUTS];
  try {
    const saved: ShortcutBinding[] = JSON.parse(raw);
    const merged = DEFAULT_SHORTCUTS.map((def) => {
      const override = saved.find((s) => s.id === def.id);
      return override ? { ...def, keys: override.keys } : def;
    });
    return merged;
  } catch {
    return [...DEFAULT_SHORTCUTS];
  }
}

export async function saveShortcuts(shortcuts: ShortcutBinding[]): Promise<void> {
  await putSetting(SETTING_KEY, JSON.stringify(shortcuts));
}
