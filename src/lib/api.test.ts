import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOCTOR_ID } from '@/mocks/data/staff';
import { server } from '@/mocks/node';
import { mockSession } from '@/mocks/session';
import { api, ApiError, setAccessToken, setSessionExpiredHandler } from './api';

/** An access token that expired a second ago: the fake backend answers 401 to it. */
const EXPIRED_TOKEN = `mock.${DOCTOR_ID}.${Date.now() - 1000}`;

/** Counts how many times the app called the refresh endpoint. */
function countRefreshCalls() {
  let count = 0;
  const listener = ({ request }: { request: Request }) => {
    if (new URL(request.url).pathname === '/api/identity/auth/refresh') count++;
  };
  server.events.on('request:start', listener);
  return () => count;
}

describe('api()', () => {
  afterEach(() => {
    setAccessToken(null);
    server.events.removeAllListeners();
  });

  it('refreshes ONCE for many parallel 401s, then retries them all', async () => {
    mockSession.start(DOCTOR_ID); // the refresh "cookie" is valid
    setAccessToken(EXPIRED_TOKEN);
    const refreshCalls = countRefreshCalls();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api<{ id: string }>('/identity/staff/me'),
      ),
    );

    expect(results.map((r) => r.id)).toEqual(Array(5).fill(DOCTOR_ID));
    expect(refreshCalls()).toBe(1); // not 5: the refresh token rotates
  });

  it('ends the session when refresh fails too', async () => {
    setAccessToken(EXPIRED_TOKEN); // and no session: refresh answers 401
    const expired = vi.fn();
    setSessionExpiredHandler(expired);

    await expect(api('/identity/staff/me')).rejects.toMatchObject({
      status: 401,
    });
    expect(expired).toHaveBeenCalledOnce();
  });

  it('turns "server unreachable" into an unavailable ApiError', async () => {
    server.use(http.get('/api/identity/staff/me', () => HttpResponse.error()));

    const error = await api('/identity/staff/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isUnavailable).toBe(true);
  });

  it('gives the backend error code on 4xx', async () => {
    server.use(
      http.get('/api/identity/staff/me', () =>
        HttpResponse.json({ error: 'staff_not_found' }, { status: 404 }),
      ),
    );
    await expect(api('/identity/staff/me')).rejects.toMatchObject({
      status: 404,
      code: 'staff_not_found',
    });
  });
});
