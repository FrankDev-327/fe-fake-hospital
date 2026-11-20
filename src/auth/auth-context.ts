import { createContext, useContext } from 'react';
import type { Staff } from './types';

/**
 * - loading: app just started, we're asking the server if the refresh cookie is still valid
 * - logged_out / logged_in: we know
 */
export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'logged_out'; user: null; reason?: 'expired' | 'idle' }
  | { status: 'logged_in'; user: Staff };

export interface Auth {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: (reason?: 'expired' | 'idle') => Promise<void>;
}

export const AuthContext = createContext<Auth | null>(null);

/** Any component can call useAuth() to know who is logged in. */
export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}
