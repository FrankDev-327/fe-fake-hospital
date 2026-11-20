import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as client from '@/lib/api';
import { AuthContext } from './auth-context';
import type { Auth, AuthState } from './auth-context';
import type { Staff } from './types';
import { useIdleLogout } from './useIdleLogout';

/** Shared ward computers: log out after this long without mouse/keyboard activity. */
const IDLE_LOGOUT_MS = 15 * 60 * 1000;

const fetchMe = () => client.api<Staff>('/identity/staff/me');

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
  });

  const logout = useCallback(
    async (reason?: 'expired' | 'idle') => {
      await client.logout();
      // patient data fetched during the session must not survive it
      queryClient.clear();
      setState({ status: 'logged_out', user: null, reason });
    },
    [queryClient],
  );

  // Startup: page reload lost the access token; the refresh cookie may still be valid.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await client.refreshAccessToken();
      const user = ok ? await fetchMe().catch(() => null) : null;
      if (cancelled) return;
      setState(
        user
          ? { status: 'logged_in', user }
          : { status: 'logged_out', user: null },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Any API call that can't refresh anymore ends the session.
  useEffect(() => {
    client.setSessionExpiredHandler(() => void logout('expired'));
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    await client.login(email, password);
    const user = await fetchMe();
    setState({ status: 'logged_in', user });
  }, []);

  useIdleLogout(
    state.status === 'logged_in',
    IDLE_LOGOUT_MS,
    () => void logout('idle'),
  );

  const auth = useMemo<Auth>(
    () => ({ state, login, logout }),
    [state, login, logout],
  );
  return <AuthContext value={auth}>{children}</AuthContext>;
}
