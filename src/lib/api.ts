/**
 * The one place the app talks to the backend. Every request goes to /api/... on our own origin
 * (Vite in dev, nginx in prod forward it to the gateway).
 *
 * Tokens:
 * - access token (15 min): kept ONLY in this module variable, in memory. Never localStorage:
 *   anything in localStorage can be read by any script on the page.
 * - refresh token (12 h): an httpOnly cookie the server sets. We can't read it, and that's the
 *   point. The browser sends it by itself to /api/identity/auth/*.
 *
 * A page reload wipes the access token, so on startup we call refresh: if the cookie is still
 * valid we get a new access token and the user stays logged in.
 */

let accessToken: string | null = null;

/** Called when the session is gone for good (refresh failed): the app goes to the login page. */
let onSessionExpired: () => void = () => {};

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/** An answer from the backend that wasn't 2xx. `code` is the backend's `error` field. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly body: unknown,
  ) {
    super(`API ${status}${code ? ` ${code}` : ''}`);
  }

  /** 502/503/504 or no answer at all: the service is down, not "you did something wrong". */
  get isUnavailable() {
    return this.status === 0 || this.status >= 502;
  }
}

export interface LoginResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: string;
}

async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const code =
    body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : undefined;
  return new ApiError(res.status, code, body);
}

/** fetch that turns "server unreachable" into an ApiError with status 0 */
async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    // same-origin is the default: cookies are sent to our own origin only
    return await fetch(new URL(`/api${path}`, window.location.origin), {
      ...init,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'network_error', null);
  }
}

/**
 * Refresh, but only ONE at a time. The refresh token rotates: every use revokes it and the
 * backend treats a second use of the same token as theft and logs the user out everywhere.
 * So if 5 requests get 401 together, they must share one refresh call, not make 5.
 * - inside this tab: share one promise
 * - across tabs: the Web Locks API, so two open tabs don't refresh at the same moment
 *   (the second tab waits, then sends the NEW cookie the first one received)
 */
let refreshing: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  refreshing ??= withRefreshLock(async () => {
    const res = await send('/identity/auth/refresh', { method: 'POST' });
    if (!res.ok) {
      accessToken = null;
      return false;
    }
    const body = (await res.json()) as LoginResponse;
    accessToken = body.accessToken;
    return true;
  })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  // navigator.locks exists in every current browser; jsdom (tests) doesn't have it
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('hospital-token-refresh', fn);
  }
  return fn();
}

export async function login(email: string, password: string) {
  const res = await send('/identity/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await toApiError(res);
  const body = (await res.json()) as LoginResponse;
  accessToken = body.accessToken;
}

export async function logout() {
  accessToken = null;
  // the server revokes the refresh token and clears the cookie; if it's down we still log out here
  await send('/identity/auth/logout', { method: 'POST' }).catch(() => {});
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Calls the API with the access token. On 401 it refreshes once and retries once.
 * Returns the parsed JSON (or undefined for 204).
 */
export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const doFetch = () => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (options.body !== undefined)
      headers['Content-Type'] = 'application/json';
    return send(path, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  };

  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      onSessionExpired();
      throw await toApiError(res);
    }
    res = await doFetch();
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Opens a long response (the live SSE stream) with the access token, refreshing it once on
 * 401 like api(). EventSource can't send the Authorization header, so it's plain fetch.
 */
export async function openStream(
  path: string,
  signal: AbortSignal,
): Promise<Response> {
  const go = () =>
    send(path, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      signal,
    });
  let res = await go();
  if (res.status === 401 && (await refreshAccessToken())) res = await go();
  return res;
}
