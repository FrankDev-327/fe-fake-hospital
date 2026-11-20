/**
 * Fake version of the backend's tokens.
 *
 * The real refresh token is an httpOnly cookie the server sets. A mock running in the page can't
 * set httpOnly cookies, so the fake "cookie" (which staff member is logged in) is kept here,
 * in localStorage, so a page reload keeps you logged in like the real thing would.
 * This only ever holds a fake staff id, never real data.
 */
const SESSION_KEY = 'mock-api:session';

/** Same as the backend: 15 min. Lower it to see the silent refresh happen. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export const mockSession = {
  start(staffId: string) {
    localStorage.setItem(SESSION_KEY, staffId);
  },
  current(): string | null {
    return localStorage.getItem(SESSION_KEY);
  },
  end() {
    localStorage.removeItem(SESSION_KEY);
  },
};

/** "mock.<staffId>.<expiresAtMs>": readable on purpose, it's fake. */
export function issueAccessToken(staffId: string) {
  return `mock.${staffId}.${Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000}`;
}

/** The staff id from "Authorization: Bearer mock...", or null if missing/expired. */
export function staffIdFromRequest(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer mock\.(.+)\.(\d+)$/.exec(header);
  if (!match) return null;
  const [, staffId, expiresAt] = match;
  return Number(expiresAt) > Date.now() ? (staffId ?? null) : null;
}
