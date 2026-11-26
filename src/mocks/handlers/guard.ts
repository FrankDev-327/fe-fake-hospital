import { HttpResponse } from 'msw';
import type { z } from 'zod';
import type { Staff, StaffRole } from '@/auth/types';
import { STAFF } from '../data/staff';
import { accessiblePatientIds } from '../db';
import { staffIdFromRequest } from '../session';

/**
 * The backend's auth guard + @Roles(), faked:
 * no/expired token -> 401, wrong role -> 403 { error: 'forbidden' }.
 * Returns the staff member, or a Response the handler must return as is.
 */
export function guard(
  request: Request,
  roles?: readonly StaffRole[],
): Staff | Response {
  const staffId = staffIdFromRequest(request);
  const staff = staffId ? STAFF.find((s) => s.id === staffId) : undefined;
  if (!staff)
    return HttpResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (roles && !roles.includes(staff.role))
    return HttpResponse.json({ error: 'forbidden' }, { status: 403 });
  return staff;
}

/** The backend's access check: not your patient = 404 (doesn't even say the patient exists). */
export function canSeePatient(staff: Staff, patientId: string) {
  return accessiblePatientIds(staff.id, staff.role).includes(patientId);
}

export const notFound = (error: string) =>
  HttpResponse.json({ error }, { status: 404 });

export const badRequest = (error = 'validation_failed') =>
  HttpResponse.json({ error }, { status: 400 });

/** Zod failure -> the backend's 400 shape (libs/http ZodPipe) */
export const validationError = (error: z.ZodError) =>
  HttpResponse.json(
    {
      error: 'validation_failed',
      issues: error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    },
    { status: 400 },
  );

export const conflict = (error: string, extra: Record<string, unknown> = {}) =>
  HttpResponse.json({ error, ...extra }, { status: 409 });

export const forbidden = (
  error = 'forbidden',
  extra: Record<string, unknown> = {},
) => HttpResponse.json({ error, ...extra }, { status: 403 });

/** Every chart endpoint: role check + "is this my patient" (404 if not). */
export function chartAccess(
  request: Request,
  params: Record<string, unknown>,
  roles: readonly StaffRole[],
) {
  const staff = guard(request, roles);
  if (staff instanceof Response) return staff;
  const patientId = String(params.patientId);
  if (!canSeePatient(staff, patientId)) return notFound('patient_not_found');
  return { staff, patientId };
}
