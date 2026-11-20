import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { AuthProvider } from '@/auth/AuthProvider';
import { ToastProvider } from '@/components/toast';
import { STAFF } from '@/mocks/data/staff';
import { mockSession } from '@/mocks/session';
import { createAppRouter } from '@/router';
import type { StaffRole } from '@/auth/types';

/**
 * Renders the WHOLE app (auth, router, queries) at `path`, against the fake backend.
 * `as: 'doctor'` = already logged in as the demo doctor (like reloading the page with a valid cookie).
 */
export function renderApp(path = '/', { as }: { as?: StaffRole } = {}) {
  if (as) {
    const staff = STAFF.find((s) => s.role === as && s.isActive)!;
    mockSession.start(staff.id);
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <App router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, user, router, queryClient };
}
