import { targetLanguages } from '../shared/translations';

export const locales = targetLanguages;
export type Locale = (typeof locales)[number];
export function resolveLocale(preferences: readonly string[]): Locale {
  for (const preference of preferences) {
    const base = preference.toLowerCase().split(/[-_]/)[0];
    if (locales.includes(base as Locale)) return base as Locale;
  }
  return 'en';
}
