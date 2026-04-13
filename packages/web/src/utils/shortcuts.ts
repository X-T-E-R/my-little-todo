import i18n from '../locales';

export type ShortcutScope = 'editor' | 'global' | 'plugin';

export interface ShortcutBinding {
  id: string;
  action: string;
  label: string;
  keys: string;
  scope: ShortcutScope;
}

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  // Global shortcuts
  {
    id: 'app.newTask',
    action: 'app.newTask',
    label: i18n.t('shortcuts.New Task', { ns: 'common' }),
    keys: 'Ctrl+N',
    scope: 'global',
  },
  {
    id: 'app.viewNow',
    action: 'app.viewNow',
    label: i18n.t('shortcuts.Switch to Now', { ns: 'common' }),
    keys: 'Ctrl+1',
    scope: 'global',
  },
  {
    id: 'app.viewStream',
    action: 'app.viewStream',
    label: i18n.t('shortcuts.Switch to Stream', { ns: 'common' }),
    keys: 'Ctrl+2',
    scope: 'global',
  },
  {
    id: 'app.viewBoard',
    action: 'app.viewBoard',
    label: i18n.t('shortcuts.Switch to Tasks', { ns: 'common' }),
    keys: 'Ctrl+3',
    scope: 'global',
  },
  {
    id: 'app.viewSettings',
    action: 'app.viewSettings',
    label: i18n.t('shortcuts.Open Settings', { ns: 'common' }),
    keys: 'Ctrl+,',
    scope: 'global',
  },
  {
    id: 'app.submit',
    action: 'app.submit',
    label: i18n.t('shortcuts.Submit', { ns: 'common' }),
    keys: 'Ctrl+Enter',
    scope: 'global',
  },

  // Editor shortcuts (Typora-based)
  {
    id: 'editor.bold',
    action: 'editor.bold',
    label: i18n.t('shortcuts.Bold', { ns: 'common' }),
    keys: 'Ctrl+B',
    scope: 'editor',
  },
  {
    id: 'editor.italic',
    action: 'editor.italic',
    label: i18n.t('shortcuts.Italic', { ns: 'common' }),
    keys: 'Ctrl+I',
    scope: 'editor',
  },
  {
    id: 'editor.underline',
    action: 'editor.underline',
    label: i18n.t('shortcuts.Underline', { ns: 'common' }),
    keys: 'Ctrl+U',
    scope: 'editor',
  },
  {
    id: 'editor.strikethrough',
    action: 'editor.strikethrough',
    label: i18n.t('shortcuts.Strikethrough', { ns: 'common' }),
    keys: 'Alt+Shift+5',
    scope: 'editor',
  },
  {
    id: 'editor.inlineCode',
    action: 'editor.inlineCode',
    label: i18n.t('shortcuts.Inline Code', { ns: 'common' }),
    keys: 'Ctrl+Shift+`',
    scope: 'editor',
  },
  {
    id: 'editor.codeBlock',
    action: 'editor.codeBlock',
    label: i18n.t('shortcuts.Code Block', { ns: 'common' }),
    keys: 'Ctrl+Shift+K',
    scope: 'editor',
  },
  {
    id: 'editor.link',
    action: 'editor.link',
    label: i18n.t('shortcuts.Hyperlink', { ns: 'common' }),
    keys: 'Ctrl+K',
    scope: 'editor',
  },
  {
    id: 'editor.quote',
    action: 'editor.quote',
    label: i18n.t('shortcuts.Quote', { ns: 'common' }),
    keys: 'Ctrl+Shift+Q',
    scope: 'editor',
  },
  {
    id: 'editor.orderedList',
    action: 'editor.orderedList',
    label: i18n.t('shortcuts.Ordered List', { ns: 'common' }),
    keys: 'Ctrl+Shift+[',
    scope: 'editor',
  },
  {
    id: 'editor.unorderedList',
    action: 'editor.unorderedList',
    label: i18n.t('shortcuts.Unordered List', { ns: 'common' }),
    keys: 'Ctrl+Shift+]',
    scope: 'editor',
  },
  {
    id: 'editor.table',
    action: 'editor.table',
    label: i18n.t('shortcuts.Table', { ns: 'common' }),
    keys: 'Ctrl+T',
    scope: 'editor',
  },
  {
    id: 'editor.clearFormat',
    action: 'editor.clearFormat',
    label: i18n.t('shortcuts.Clear Format', { ns: 'common' }),
    keys: 'Ctrl+\\',
    scope: 'editor',
  },
  {
    id: 'editor.heading1',
    action: 'editor.heading1',
    label: i18n.t('shortcuts.Heading 1', { ns: 'common' }),
    keys: 'Ctrl+1',
    scope: 'editor',
  },
  {
    id: 'editor.heading2',
    action: 'editor.heading2',
    label: i18n.t('shortcuts.Heading 2', { ns: 'common' }),
    keys: 'Ctrl+2',
    scope: 'editor',
  },
  {
    id: 'editor.heading3',
    action: 'editor.heading3',
    label: i18n.t('shortcuts.Heading 3', { ns: 'common' }),
    keys: 'Ctrl+3',
    scope: 'editor',
  },
  {
    id: 'editor.heading4',
    action: 'editor.heading4',
    label: i18n.t('shortcuts.Heading 4', { ns: 'common' }),
    keys: 'Ctrl+4',
    scope: 'editor',
  },

  // Plugin shortcuts
  {
    id: 'plugin.brainDump',
    action: 'plugin.brainDump',
    label: i18n.t('shortcuts.Brain Dump', { ns: 'common' }),
    keys: 'Ctrl+Shift+D',
    scope: 'plugin',
  },
  {
    id: 'plugin.thinkSession',
    action: 'plugin.thinkSession',
    label: i18n.t('shortcuts.Think Session', { ns: 'common' }),
    keys: 'Ctrl+Shift+T',
    scope: 'plugin',
  },
];

/**
 * Normalize a keyboard event into a key string like "Ctrl+Shift+K".
 */
export function eventToKeyString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key === ',') key = ',';
  else if (key === '\\') key = '\\';
  else if (key === '`') key = '`';
  else if (key === '[') key = '[';
  else if (key === ']') key = ']';
  else if (key === 'Enter') key = 'Enter';
  else if (key.length === 1) key = key.toUpperCase();

  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    parts.push(key);
  }

  return parts.join('+');
}

/**
 * Check if a keyboard event matches a shortcut binding's key string.
 */
export function matchesShortcut(e: KeyboardEvent, keys: string): boolean {
  return eventToKeyString(e) === keys;
}
