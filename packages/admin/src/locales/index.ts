import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhAdmin from './zh-CN/admin.json';

export const defaultNS = 'admin' as const;

export const resources = {
  'zh-CN': { admin: zhAdmin },
  en: { admin: {} },
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
  ns: ['admin'],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
