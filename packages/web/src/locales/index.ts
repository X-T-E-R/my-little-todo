import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAi from './en/ai.json';
import enBoard from './en/board.json';
import enCoach from './en/coach.json';
import enErrors from './en/errors.json';
import enNav from './en/nav.json';
import enNow from './en/now.json';
import enSettings from './en/settings.json';
import enStream from './en/stream.json';
import enThink from './en/think.json';
import enWidget from './en/widget.json';
import zhAi from './zh-CN/ai.json';
import zhBoard from './zh-CN/board.json';
import zhCalendar from './zh-CN/calendar.json';
import zhCoach from './zh-CN/coach.json';
import zhCommon from './zh-CN/common.json';
import zhEditor from './zh-CN/editor.json';
import zhErrors from './zh-CN/errors.json';
import zhLogin from './zh-CN/login.json';
import zhNav from './zh-CN/nav.json';
import zhNow from './zh-CN/now.json';
import zhOnboarding from './zh-CN/onboarding.json';
import zhRole from './zh-CN/role.json';
import zhSettings from './zh-CN/settings.json';
import zhStream from './zh-CN/stream.json';
import zhTask from './zh-CN/task.json';
import zhThink from './zh-CN/think.json';
import zhWidget from './zh-CN/widget.json';

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
    coach: zhCoach,
    think: zhThink,
    ai: zhAi,
    widget: zhWidget,
  },
  en: {
    coach: enCoach,
    widget: enWidget,
    common: {},
    nav: enNav,
    now: enNow,
    stream: enStream,
    board: enBoard,
    settings: enSettings,
    task: {},
    onboarding: {},
    login: {},
    editor: {},
    calendar: {},
    role: {},
    errors: enErrors,
    think: enThink,
    ai: enAi,
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
