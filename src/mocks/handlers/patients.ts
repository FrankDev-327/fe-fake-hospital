import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';
import { toSummary } from '../data/patients';
import {
  accessiblePatientIds,
  mockDb,
  newId,
  nowIso,
  patientById,
} from '../db';
import {
  badRequest,
  canSeePatient,
  guard,
  notFound,
  validationError,
} from './guard';

/** Same rules as apps/patients/src/patients/patients.schemas.ts */
const isValidOib = (oib: string) => {
  if (!/^\d{11}$/.test(oib)) return false;
  let a = 10;
  for (let i = 0; i < 10; i++) {
    a = (a + Number(oib[i])) % 10;
    if (a === 0) a = 10;
    a = (a * 2) % 11;
  }
  return (11 - a) % 10 === Number(oib[10]);
};
const name = z.string().trim().min(1).max(100);
const oib = z.string().trim().refine(isValidOib);
const mbo = z
  .string()
  .trim()
  .regex(/^\d{9}$/);
const dateOfBirth = z.iso
  .date()
  .refine((d) => Date.parse(d) <= Date.now() && d >= '1900-01-01');
const SEXES = ['female', 'male', 'other', 'unknown'] as const;
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-'] as const;
const optional = {
  oib: oib.nullable(),
  mbo: mbo.nullable(),
  email: z.email().max(254).nullable(),
  phone: z.string().trim().min(6).max(30).nullable(),
  address: z.string().trim().min(3).max(300).nullable(),
  bloodType: z.enum(BLOOD_TYPES).nullable(),
};
const RegisterBody = z.object({
  firstName: name,
  lastName: name,
  dateOfBirth,
  sex: z.enum(SEXES),
  oib: optional.oib.default(null),
  mbo: optional.mbo.default(null),
  email: optional.email.default(null),
  phone: optional.phone.default(null),
  address: optional.address.default(null),
  bloodType: optional.bloodType.default(null),
});
const UpdateBody = z
  .object({
    version: z.number().int().min(1),
    firstName: name.optional(),
    lastName: name.optional(),
    dateOfBirth: dateOfBirth.optional(),
    sex: z.enum(SEXES).optional(),
    oib: optional.oib.optional(),
    mbo: optional.mbo.optional(),
    email: optional.email.optional(),
    phone: optional.phone.optional(),
    address: optional.address.optional(),
    bloodType: optional.bloodType.optional(),
  })
  .refine((b) => Object.keys(b).length > 1);
const ContactBody = z.object({
  relationship: z.string().trim().min(2).max(50),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(6).max(30),
});

/** apps/patients (through the gateway: /api/patients/...) */
export const patientsHandlers = [
  http.post('/api/patients/patients', async ({ request }) => {
    await delay();
    const staff = guard(request, ['receptionist', 'admin']);
    if (staff instanceof Response) return staff;
    const parsed = RegisterBody.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return validationError(parsed.error);
    const body = parsed.data;

    const { patients } = mockDb.get();
    const duplicate = patients.find(
      (p) =>
        (body.oib && p.oib === body.oib) || (body.mbo && p.mbo === body.mbo),
    );
    if (duplicate)
      return HttpResponse.json(
        {
          error: 'patient_already_registered',
          patientId: duplicate.id,
          mrn: duplicate.mrn,
        },
        { status: 409 },
      );

    const now = nowIso();
    const patient = {
      id: newId(),
      mrn: `MRN-${250000 + patients.length}`,
      ...body,
      deceasedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    patients.push(patient);
    mockDb.save();
    return HttpResponse.json(patient, { status: 201 });
  }),

  http.get('/api/patients/patients/mine', async ({ request }) => {
    await delay();
    const staff = guard(request, ['doctor', 'nurse']);
    if (staff instanceof Response) return staff;
    const ids = accessiblePatientIds(staff.id, staff.role);
    return HttpResponse.json({
      items: mockDb
        .get()
        .patients.filter((p) => ids.includes(p.id))
        .map(toSummary),
    });
  }),

  /** Front desk search: exactly one of q (name/MRN, 3+ chars), oib, mbo */
  http.get('/api/patients/patients/search', async ({ request }) => {
    await delay();
    const staff = guard(request, ['receptionist', 'admin']);
    if (staff instanceof Response) return staff;
    const params = new URL(request.url).searchParams;
    const q = params.get('q')?.trim().toLowerCase();
    const oibQ = params.get('oib');
    const mboQ = params.get('mbo');
    if ([q, oibQ, mboQ].filter(Boolean).length !== 1 || (q && q.length < 3))
      return badRequest();
    const items = mockDb
      .get()
      .patients.filter((p) =>
        q
          ? `${p.firstName ?? ''} ${p.lastName}`.toLowerCase().includes(q) ||
            `${p.lastName} ${p.firstName ?? ''}`.toLowerCase().includes(q) ||
            p.mrn.toLowerCase() === q
          : oibQ
            ? p.oib === oibQ
            : p.mbo === mboQ,
      )
      .map(toSummary);
    return HttpResponse.json({ items });
  }),

  http.get('/api/patients/patients/:patientId', async ({ request, params }) => {
    await delay();
    const staff = guard(request, ['receptionist', 'admin', 'doctor', 'nurse']);
    if (staff instanceof Response) return staff;
    const patient = patientById(String(params.patientId));
    const clinician = staff.role === 'doctor' || staff.role === 'nurse';
    if (!patient || (clinician && !canSeePatient(staff, patient.id)))
      return notFound('patient_not_found');
    return HttpResponse.json(patient);
  }),

  /** Mother <-> child links (made by a birth). Same access as the chart. */
  http.get(
    '/api/patients/patients/:patientId/relations',
    async ({ request, params }) => {
      await delay();
      const staff = guard(request, [
        'receptionist',
        'admin',
        'doctor',
        'nurse',
      ]);
      if (staff instanceof Response) return staff;
      const id = String(params.patientId);
      const clinician = staff.role === 'doctor' || staff.role === 'nurse';
      if (!patientById(id) || (clinician && !canSeePatient(staff, id)))
        return notFound('patient_not_found');
      const card = (relation: 'mother' | 'child', otherId: string) => {
        const o = patientById(otherId)!;
        return {
          relation,
          patientId: o.id,
          mrn: o.mrn,
          firstName: o.firstName,
          lastName: o.lastName,
        };
      };
      const { relations } = mockDb.get();
      const items = [
        ...relations
          .filter((r) => r.childId === id)
          .map((r) => card('mother', r.motherId)),
        ...relations
          .filter((r) => r.motherId === id)
          .map((r) => card('child', r.childId)),
      ];
      return HttpResponse.json({ items });
    },
  ),

  /** Partial update with optimistic locking: wrong version -> 409 stale_version */
  http.patch(
    '/api/patients/patients/:patientId',
    async ({ request, params }) => {
      await delay();
      const staff = guard(request, ['receptionist', 'admin']);
      if (staff instanceof Response) return staff;
      const parsed = UpdateBody.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success) return validationError(parsed.error);
      const { version, ...changes } = parsed.data;

      const patient = patientById(String(params.patientId));
      if (!patient) return notFound('patient_not_found');
      if (patient.version !== version)
        return HttpResponse.json(
          { error: 'stale_version', currentVersion: patient.version },
          { status: 409 },
        );
      const others = mockDb.get().patients.filter((p) => p.id !== patient.id);
      if (changes.oib && others.some((p) => p.oib === changes.oib))
        return HttpResponse.json(
          { error: 'oib_belongs_to_another_patient' },
          { status: 409 },
        );
      if (changes.mbo && others.some((p) => p.mbo === changes.mbo))
        return HttpResponse.json(
          { error: 'mbo_belongs_to_another_patient' },
          { status: 409 },
        );

      Object.assign(patient, changes, {
        version: patient.version + 1,
        updatedAt: nowIso(),
      });
      mockDb.save();
      return HttpResponse.json(patient);
    },
  ),

  http.get(
    '/api/patients/patients/:patientId/contacts',
    async ({ request, params }) => {
      await delay();
      const staff = guard(request, [
        'receptionist',
        'admin',
        'doctor',
        'nurse',
      ]);
      if (staff instanceof Response) return staff;
      const patientId = String(params.patientId);
      const clinician = staff.role === 'doctor' || staff.role === 'nurse';
      if (
        !patientById(patientId) ||
        (clinician && !canSeePatient(staff, patientId))
      )
        return notFound('patient_not_found');
      return HttpResponse.json({
        items: mockDb
          .get()
          .contacts.filter((c) => c.patientId === patientId)
          .map(({ patientId: _, ...c }) => c),
      });
    },
  ),

  http.post(
    '/api/patients/patients/:patientId/contacts',
    async ({ request, params }) => {
      await delay();
      const staff = guard(request, ['receptionist', 'admin']);
      if (staff instanceof Response) return staff;
      const patientId = String(params.patientId);
      if (!patientById(patientId)) return notFound('patient_not_found');
      const parsed = ContactBody.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success) return validationError(parsed.error);
      const contact = { id: newId(), patientId, ...parsed.data };
      mockDb.get().contacts.push(contact);
      mockDb.save();
      const { patientId: _, ...view } = contact;
      return HttpResponse.json(view, { status: 201 });
    },
  ),
];
