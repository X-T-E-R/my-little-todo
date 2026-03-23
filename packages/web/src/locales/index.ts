import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhCommon from './zh-CN/common.json';
import zhNav from './zh-CN/nav.json';
import zhNow from './zh-CN/now.json';
import zhStream from './zh-CN/stream.json';
import zhBoard from './zh-CN/board.json';
import zhSettings from './zh-CN/settings.json';
import zhTask from './zh-CN/task.json';
import zhOnboarding from './zh-CN/onboarding.json';
import zhLogin from './zh-CN/login.json';
import zhEditor from './zh-CN/editor.json';
import zhCalendar from './zh-CN/calendar.json';
import zhRole from './zh-CN/role.json';
import zhErrors from './zh-CN/errors.json';

export const defaultNS = 'common' as const;

export const resources = {
  'zh-CN': {
    common: zhCommon,
    nav: zhNav,
    now: zhNow,
    stream: zhStream,
    board: zhBoard,
    settings: zhSettings,
    task: zhTask,
    onboarding: zhOnboarding,
    login: zhLogin,
    editor: zhEditor,
    calendar: zhCalendar,
    role: zhRole,
    errors: zhErrors,
  },
  en: {
    common: {},
    nav: {},
    now: {},
    stream: {},
    board: {},
    settings: {},
    task: {},
    onboarding: {},
    login: {},
    editor: {},
    calendar: {},
    role: {},
    errors: {},
  },
} as const;

function detectLanguage(): string {
  const saved = localStorage.getItem('language');
  if (saved && saved in resources) return saved;

  const nav = navigator.language;
  if (nav.startsWith('zh')) return 'zh-CN';
  return 'en';
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: 'en',
  defaultNS,
  ns: Object.keys(resources['zh-CN']),
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
