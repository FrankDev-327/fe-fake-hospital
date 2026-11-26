import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage } from './index';
import type { Language } from './index';

export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      {t('app.language')}
      <select
        value={i18n.language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
