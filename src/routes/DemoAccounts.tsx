import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mockDb } from '@/mocks/db';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/mocks/data/staff';

/** Only with the fake backend: one click fills the login form for a role. */
export function DemoAccounts({
  onPick,
}: {
  onPick: (email: string, password: string) => void;
}) {
  const { t } = useTranslation();
  const accounts = DEMO_ACCOUNTS;
  return (
    <section className="space-y-2 rounded-md border border-dashed border-amber-300 bg-amber-50 p-3">
      <h2 className="text-xs font-semibold tracking-wide text-amber-800 uppercase">
        {t('login.demo')}
      </h2>
      <ul className="grid grid-cols-2 gap-2">
        {accounts.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onPick(s.email, DEMO_PASSWORD)}
              className="w-full rounded border border-amber-200 bg-white px-2 py-1 text-left text-xs hover:border-amber-400"
            >
              <span className="block font-medium">{t(`roles.${s.role}`)}</span>
              <span className="block text-slate-500">
                {s.firstName} {s.lastName}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <ResetDemoData />
    </section>
  );
}

/** Throw away everything changed in demo mode (registered patients, notes...) */
function ResetDemoData() {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        mockDb.reset();
        setDone(true);
      }}
      className="text-xs text-amber-800 underline"
    >
      {done ? t('login.resetDone') : t('login.reset')}
    </button>
  );
}
