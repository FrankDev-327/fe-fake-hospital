import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { navFor } from '@/app/nav';
import { useAuth } from '@/auth/auth-context';
import { displayName } from '@/lib/format';

/** translation key */
function greeting(hour: number) {
  if (hour < 12) return 'home.morning';
  if (hour < 18) return 'home.afternoon';
  return 'home.evening';
}

export function HomePage() {
  const { t } = useTranslation();
  const { state } = useAuth();
  if (state.status !== 'logged_in') return null;
  const items = navFor(state.user.role);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {t(greeting(new Date().getHours()))}, {displayName(state.user)}
      </h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="block h-full rounded-lg border border-slate-200 bg-white p-5 hover:border-teal-600 hover:shadow-sm"
            >
              <div className="font-medium text-teal-800">
                {t(`nav.${item.to}.label`)}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {t(`nav.${item.to}.description`)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
