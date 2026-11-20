import { Link, Outlet } from '@tanstack/react-router';
import { navFor } from '@/app/nav';
import { useAuth } from '@/auth/auth-context';
import { ROLE_LABELS } from '@/auth/types';
import { Button } from '@/components/Button';
import { displayName } from '@/lib/format';

/** Sidebar + header around every logged-in page. <Outlet /> is where the current page goes. */
export function AppLayout() {
  const { state, logout } = useAuth();
  if (state.status !== 'logged_in') return null; // the route check already redirected
  const { user } = state;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <Link to="/" className="px-5 py-4 text-lg font-semibold text-teal-800">
          Fake Hospital
        </Link>
        <nav aria-label="Main" className="flex-1 space-y-1 px-3">
          <NavLink to="/" label="Home" exact />
          {navFor(user.role).map((item) => (
            <NavLink key={item.to} to={item.to} label={item.label} />
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-right text-sm">
            <div className="font-medium">{displayName(user)}</div>
            <div className="text-slate-500">{ROLE_LABELS[user.role]}</div>
          </div>
          <Button variant="secondary" onClick={() => void logout()}>
            Log out
          </Button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavLink({
  to,
  label,
  exact = false,
}: {
  to: string;
  label: string;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
      activeProps={{ className: 'bg-teal-50 font-medium text-teal-800' }}
    >
      {label}
    </Link>
  );
}
