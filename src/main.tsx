import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { AuthProvider } from '@/auth/AuthProvider';
import { ToastProvider } from '@/components/toast';
import { ApiError } from '@/lib/api';
import { MOCK_API } from '@/mocks/enabled';
import './index.css';
import '@/i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // retrying a 4xx won't change the answer; retry only when the service may come back
      retry: (failureCount, error) =>
        error instanceof ApiError && error.isUnavailable && failureCount < 2,
    },
  },
});

// Fake backend: start it BEFORE the app makes its first request.
// The production build drops this code (and MSW) completely. Only the "demo" build
// (`pnpm build:demo`, used by the frontend load test) keeps it.
const FAKE_ALLOWED = import.meta.env.DEV || import.meta.env.MODE === 'demo';
if (FAKE_ALLOWED && MOCK_API) {
  const { worker } = await import('@/mocks/browser');
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
