import { RouterProvider } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useAuth } from '@/auth/auth-context';
import { router as defaultRouter } from '@/router';
import type { AppRouter } from '@/router';

export function App({ router = defaultRouter }: { router?: AppRouter }) {
  const auth = useAuth();

  // when someone logs in or out, run the route checks (beforeLoad) again:
  // logout -> sent to /login, login -> sent to where they were going.
  // Not while 'loading': the router isn't mounted yet and has no auth in its context.
  useEffect(() => {
    if (auth.state.status !== 'loading') void router.invalidate();
  }, [auth.state.status, router]);

  if (auth.state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }
  return <RouterProvider router={router} context={{ auth }} />;
}
