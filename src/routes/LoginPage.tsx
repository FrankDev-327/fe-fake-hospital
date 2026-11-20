import { zodResolver } from '@hookform/resolvers/zod';
import { lazy, Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/auth/auth-context';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api';
import { MOCK_API } from '@/mocks/enabled';

/**
 * Loaded only in demo mode. A normal import would put the fake staff list into the production
 * bundle even though it's never shown; a dynamic import behind a constant `false` is dropped.
 */
const DemoAccounts =
  import.meta.env.DEV && MOCK_API
    ? lazy(() =>
        import('./DemoAccounts').then((m) => ({ default: m.DemoAccounts })),
      )
    : null;

// Same rules as the backend's LoginBody, so obvious mistakes are caught before the request.
const LoginForm = z.object({
  email: z.email('Enter a valid email').max(254),
  password: z.string().min(1, 'Enter your password').max(200),
});
type LoginForm = z.infer<typeof LoginForm>;

const REASONS = {
  expired: 'Your session expired. Please log in again.',
  idle: 'You were logged out after 15 minutes without activity.',
};

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Wrong email or password.';
    if (error.isUnavailable)
      return 'Login is unavailable right now. Try again in a moment.';
  }
  return 'Something went wrong. Try again.';
}

export function LoginPage() {
  const { state, login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(LoginForm) });

  // After a successful login <App> re-runs the route checks and /login redirects away by itself.
  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
    } catch (error) {
      setServerError(loginErrorMessage(error));
    }
  };

  const reason = state.status === 'logged_out' ? state.reason : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-teal-800">
            Fake Hospital
          </h1>
          <p className="text-sm text-slate-500">Staff login</p>
        </div>

        {reason && !serverError && <Alert tone="info">{REASONS[reason]}</Alert>}
        {serverError && <Alert>{serverError}</Alert>}

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            autoFocus
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>

        {DemoAccounts && (
          <Suspense fallback={null}>
            <DemoAccounts
              onPick={(email, password) => {
                setValue('email', email, { shouldValidate: true });
                setValue('password', password, { shouldValidate: true });
              }}
            />
          </Suspense>
        )}
      </div>
    </main>
  );
}
