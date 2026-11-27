import { delay, http, HttpResponse } from 'msw';
import { DEMO_PASSWORD, STAFF } from '../data/staff';
import { guard, notFound } from './guard';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  issueAccessToken,
  mockSession,
} from '../session';

const REFRESH_TTL_MS = 12 * 60 * 60 * 1000;

const tokens = (staffId: string) => ({
  accessToken: issueAccessToken(staffId),
  accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
  refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
});

/** Same answers and error codes as apps/identity in the backend. */
export const identityHandlers = [
  http.post('/api/identity/auth/login', async ({ request }) => {
    await delay();
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      password?: string;
    } | null;
    if (!body?.email || !body.password)
      return HttpResponse.json({ error: 'validation_failed' }, { status: 400 });

    const staff = STAFF.find(
      (s) => s.email === body.email!.trim().toLowerCase(),
    );
    // one error for every reason, like the backend (don't reveal which emails exist)
    if (!staff || body.password !== DEMO_PASSWORD || !staff.isActive)
      return HttpResponse.json(
        { error: 'invalid_credentials' },
        { status: 401 },
      );

    mockSession.start(staff.id);
    return HttpResponse.json(tokens(staff.id));
  }),

  http.post('/api/identity/auth/refresh', async () => {
    await delay();
    const staffId = mockSession.current();
    if (!staffId)
      return HttpResponse.json(
        { error: 'invalid_refresh_token' },
        { status: 401 },
      );
    return HttpResponse.json(tokens(staffId));
  }),

  http.post('/api/identity/auth/logout', async () => {
    await delay();
    mockSession.end();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/identity/staff/me', async ({ request }) => {
    await delay();
    const staff = guard(request);
    if (staff instanceof Response) return staff;
    return HttpResponse.json(staff);
  }),

  /**
   * Doctors directory (cards only): the receptionist picks a doctor to see their schedule.
   */
  http.get('/api/identity/staff/doctors', async ({ request }) => {
    await delay();
    const staff = guard(request, ['receptionist', 'admin', 'nurse', 'doctor']);
    if (staff instanceof Response) return staff;
    return HttpResponse.json({
      items: STAFF.filter((s) => s.role === 'doctor' && s.isActive).map(toCard),
    });
  }),

  /**
   * Nurses directory (cards only): the birth form picks the nurses who helped.
   */
  http.get('/api/identity/staff/nurses', async ({ request }) => {
    await delay();
    const staff = guard(request, ['nurse', 'doctor']);
    if (staff instanceof Response) return staff;
    return HttpResponse.json({
      items: STAFF.filter((s) => s.role === 'nurse' && s.isActive).map(toCard),
    });
  }),

  /** Admin: everyone, optional ?role=, keyset paging (one page is enough for fake data) */
  http.get('/api/identity/staff', async ({ request }) => {
    await delay();
    const staff = guard(request, ['admin']);
    if (staff instanceof Response) return staff;
    const role = new URL(request.url).searchParams.get('role');
    return HttpResponse.json({
      items: STAFF.filter((s) => !role || s.role === role),
      next: null,
    });
  }),

  /** Name card of any colleague (who prescribed, who signed...) */
  http.get('/api/identity/staff/:id/card', async ({ request, params }) => {
    await delay();
    const staff = guard(request);
    if (staff instanceof Response) return staff;
    const card = STAFF.find((s) => s.id === params.id);
    return card ? HttpResponse.json(toCard(card)) : notFound('staff_not_found');
  }),
];

function toCard(s: (typeof STAFF)[number]) {
  return {
    id: s.id,
    role: s.role,
    firstName: s.firstName,
    lastName: s.lastName,
    departmentId: s.departmentId,
    licenseNumber: s.licenseNumber,
  };
}
