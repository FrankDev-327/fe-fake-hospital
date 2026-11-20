import { ROLE_LABELS } from '@/auth/types';
import { useState } from 'react';
import { mockDb } from '@/mocks/db';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/mocks/data/staff';

/** Only with the fake backend: one click fills the login form for a role. */
export function DemoAccounts({
  onPick,
}: {
  onPick: (email: string, password: string) => void;
}) {
  const accounts = DEMO_ACCOUNTS;
  return (
    <section className="space-y-2 rounded-md border border-dashed border-amber-300 bg-amber-50 p-3">
      <h2 className="text-xs font-semibold tracking-wide text-amber-800 uppercase">
        Demo mode: fake data
      </h2>
      <ul className="grid grid-cols-2 gap-2">
        {accounts.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onPick(s.email, DEMO_PASSWORD)}
              className="w-full rounded border border-amber-200 bg-white px-2 py-1 text-left text-xs hover:border-amber-400"
            >
              <span className="block font-medium">{ROLE_LABELS[s.role]}</span>
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
      {done ? 'Demo data reset' : 'Reset demo data'}
    </button>
  );
}
