import { createInstance } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import en from '../locales/en.json';
import pt from '../locales/pt.json';
import zh from '../locales/zh.json';
import { locales, resolveLocale, type Locale } from './locale';
export type MessageKey = keyof typeof en | 'clipCount';
let current: Locale = 'en';
if (typeof window !== 'undefined') {
  let saved = '';
  try {
    saved = localStorage.getItem('ollang.locale') ?? '';
  } catch {
    /* Private browsers may deny storage. */
  }
  current = resolveLocale(saved ? [saved] : navigator.languages);
}
// Bundled catalogs initialize synchronously. Switching languages never calls Ollang.
export const i18n = createInstance();
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, pt: { translation: pt }, zh: { translation: zh } },
  lng: current,
  supportedLngs: [...locales],
  fallbackLng: 'en',
  initAsync: false,
  keySeparator: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false }, // React escapes text.
});
if (typeof document !== 'undefined') document.documentElement.lang = current;
export function chooseLocale(locale: Locale) {
  current = locale;
  void i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  try {
    localStorage.setItem('ollang.locale', locale);
  } catch {
    /* Choice still works for this visit. */
  }
}
export function useLocale() {
  const { i18n: instance } = useTranslation();
  return resolveLocale([instance.resolvedLanguage ?? instance.language]);
}
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return String(i18n.t(key, params));
}
export function languageName(code: string): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([current], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}
