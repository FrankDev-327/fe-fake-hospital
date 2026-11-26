import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import hr from './hr.json';

/**
 * UI texts live in one JSON file per language (src/i18n/<lang>.json), same keys in each.
 * In a component: const { t } = useTranslation(); t('login.title').
 * The chosen language is a UI preference (no patient data), so localStorage is fine.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hr', label: 'Hrvatski' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];

const STORAGE_KEY = 'ui-language';

function savedLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.some((l) => l.code === saved)) return saved as Language;
  } catch {
    // storage blocked: use the default
  }
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hr: { translation: hr } },
  lng: savedLanguage(),
  fallbackLng: 'en', // a key missing in hr.json shows the English text
  interpolation: { escapeValue: false }, // React already escapes
});
document.documentElement.lang = i18n.language;

export function setLanguage(code: Language) {
  void i18n.changeLanguage(code);
  document.documentElement.lang = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // not saved, still works for this visit
  }
}

/**
 * Translate outside React hooks (labels in api.ts maps, error messages...). The page re-renders
 * on a language change because AppLayout remounts it (key = language).
 */
export const t = (key: string, options?: Record<string, unknown>) =>
  (i18n.t as unknown as (k: string, o?: object) => string)(key, options);

/** A Zod message translated when the form is checked (not when the schema is created) */
export const zmsg = (key: string) => ({ error: () => t(key) });

export default i18n;
