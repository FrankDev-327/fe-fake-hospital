import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';
import { APPOINTMENTS, NEWBORN_WARD_KINDS, WARDS } from '../data/admissions';
import { DELIVERY_ACCESS_MINUTES, newbornEncounter } from '../data/maternity';
import type { FakeDelivery } from '../data/maternity';
import { NURSE_DOCTORS } from '../data/patients';
import type { FakePatient } from '../data/patients';
import { STAFF } from '../data/staff';
import { mockDb, newId, nowIso, patientById } from '../db';
import {
  badRequest,
  canSeePatient,
  conflict,
  guard,
  notFound,
  validationError,
} from './guard';

/** The fake birth saga takes this long (registering -> ready), so the screen shows it */
const SAGA_MS = import.meta.env.MODE === 'test' ? 0 : 3000;

const letter = (order: number) =>
  order <= 26 ? String.fromCharCode(64 + order) : String(order);

/** GET /deliveries/:id shape (apps/admissions deliveries.service.ts view()) */
function deliveryView(d: FakeDelivery) {
  const now = Date.now();
  const { team, births, ...rest } = d;
  return {
    ...rest,
    team,
    births: births.map(({ readyAt, ...b }) => {
      const ready = Date.parse(readyAt) <= now;
      return {
        ...b,
        label: letter(b.birthOrder),
        status: ready ? 'ready' : 'registering',
        failure: null,
        steps: ['register_patient', 'grant_access', 'open_encounter'].map(
          (step, i) => ({
            step,
            // the fake saga finishes the steps one by one
            status:
              ready || now >= Date.parse(readyAt) - (3 - i) * (SAGA_MS / 3)
                ? 'done'
                : 'pending',
            detail: null,
          }),
        ),
      };
    }),
  };
}

const wardOfBed = (bedId: string) => {
  const bed = mockDb.get().beds.find((b) => b.bedId === bedId);
  return bed && { bed, ward: WARDS.find((w) => w.id === bed.wardId)! };
};

const bedOfPatient = (patientId: string) =>
  mockDb.get().beds.find((b) => b.stay?.patientId === patientId);

const reason = z.string().trim().min(3).max(200);
const staffIds = z.array(z.uuid()).max(10).default([]);
const RegisterBirthBody = z
  .object({
    sex: z.enum(['female', 'male', 'unknown']),
    bornAt: z.coerce.date().optional(),
    cotBedId: z.uuid(),
    primaryDoctorId: z.uuid(),
    team: z
      .object({ doctorIds: staffIds, nurseIds: staffIds })
      .default({ doctorIds: [], nurseIds: [] }),
  })
  .superRefine((b, ctx) => {
    const at = b.bornAt?.getTime() ?? Date.now();
    if (at > Date.now() + 60_000)
      ctx.addIssue({
        code: 'custom',
        path: ['bornAt'],
        message: 'is in the future',
      });
    if (at < Date.now() - 24 * 3600_000)
      ctx.addIssue({
        code: 'custom',
        path: ['bornAt'],
        message: 'more than 24 hours ago',
      });
  });

/** "YYYY-MM-DD" in Zagreb */
const zagrebDay = (d: Date) =>
  d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Zagreb' });

/** apps/admissions (/api/admissions/...) */
export const admissionsHandlers = [
  http.get('/api/admissions/wards', async ({ request }) => {
    await delay();
    const staff = guard(request, ['doctor', 'nurse', 'receptionist', 'admin']);
    if (staff instanceof Response) return staff;
    return HttpResponse.json(WARDS);
  }),

  // ---------------- births (backend slice 12) ----------------

  /** The mother is in labor: she must lie in a DELIVERY ward. */
  http.post(
    '/api/admissions/patients/:patientId/deliveries',
    async ({ request, params }) => {
      await delay();
      const staff = guard(request, ['doctor', 'nurse']);
      if (staff instanceof Response) return staff;
      const motherId = String(params.patientId);
      if (!canSeePatient(staff, motherId)) return notFound('patient_not_found');
      const bed = bedOfPatient(motherId);
      if (!bed) return conflict('not_admitted');
      const ward = WARDS.find((w) => w.id === bed.wardId)!;
      if (ward.kind !== 'delivery')
        return conflict('not_in_delivery_ward', { wardKind: ward.kind });
      const { deliveries } = mockDb.get();
      if (
        deliveries.some(
          (d) => d.motherPatientId === motherId && d.status === 'in_labor',
        )
      )
        return conflict('already_in_labor');
      const d: FakeDelivery = {
        id: newId(),
        motherPatientId: motherId,
        motherAdmissionId: bed.stay!.admissionId,
        status: 'in_labor',
        startedBy: staff.id,
        startedAt: nowIso(),
        deliveredAt: null,
        cancelledAt: null,
        cancelReason: null,
        team: [],
        births: [],
        version: 1,
      };
      deliveries.push(d);
      mockDb.save();
      return HttpResponse.json(deliveryView(d), { status: 201 });
    },
  ),

  /** Who is in labor now (?status=in_labor, the default), among the caller's patients. */
  http.get('/api/admissions/deliveries', async ({ request }) => {
    await delay();
    const staff = guard(request, ['doctor', 'nurse']);
    if (staff instanceof Response) return staff;
    const status =
      new URL(request.url).searchParams.get('status') ?? 'in_labor';
    if (!['in_labor', 'delivered', 'cancelled'].includes(status))
      return badRequest();
    const items = mockDb
      .get()
      .deliveries.filter(
        (d) => d.status === status && canSeePatient(staff, d.motherPatientId),
      )
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map((d) => {
        const bed = mockDb
          .get()
          .beds.find((b) => b.stay?.admissionId === d.motherAdmissionId);
        const ward = bed && WARDS.find((w) => w.id === bed.wardId);
        return {
          id: d.id,
          motherPatientId: d.motherPatientId,
          status: d.status,
          startedAt: d.startedAt,
          deliveredAt: d.deliveredAt,
          wardCode: ward?.code ?? null,
          room: bed?.room ?? null,
          bed: bed?.bed ?? null,
          babies: d.births.length,
        };
      });
    return HttpResponse.json({ items });
  }),

  http.get('/api/admissions/deliveries/:id', async ({ request, params }) => {
    await delay();
    const staff = guard(request, ['doctor', 'nurse']);
    if (staff instanceof Response) return staff;
    const d = mockDb.get().deliveries.find((x) => x.id === params.id);
    if (!d || !canSeePatient(staff, d.motherPatientId))
      return notFound('delivery_not_found');
    return HttpResponse.json(deliveryView(d));
  }),

  /** False alarm: only while no baby was born. */
  http.post(
    '/api/admissions/deliveries/:id/cancel',
    async ({ request, params }) => {
      await delay();
      const staff = guard(request, ['doctor', 'nurse']);
      if (staff instanceof Response) return staff;
      const parsed = z
        .object({ reason })
        .safeParse(await request.json().catch(() => null));
      if (!parsed.success) return validationError(parsed.error);
      const d = mockDb.get().deliveries.find((x) => x.id === params.id);
      if (!d || !canSeePatient(staff, d.motherPatientId))
        return notFound('delivery_not_found');
      if (d.status !== 'in_labor')
        return conflict('not_in_labor', { status: d.status });
      Object.assign(d, {
        status: 'cancelled',
        cancelledAt: nowIso(),
        cancelReason: parsed.data.reason,
        version: d.version + 1,
      });
      mockDb.save();
      return HttpResponse.json(deliveryView(d));
    },
  ),

  /**
   * A baby is born. 202: the baby's record, access and visit come from the (fake) saga; the
   * screen polls GET deliveries/:id until births[].status is "ready".
   */
  http.post(
    '/api/admissions/deliveries/:id/births',
    async ({ request, params }) => {
      await delay();
      const staff = guard(request, ['doctor', 'nurse']);
      if (staff instanceof Response) return staff;
      const parsed = RegisterBirthBody.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success) return validationError(parsed.error);
      const body = parsed.data;
      const db = mockDb.get();
      const d = db.deliveries.find((x) => x.id === params.id);
      if (!d || !canSeePatient(staff, d.motherPatientId))
        return notFound('delivery_not_found');
      if (d.status === 'cancelled') return conflict('delivery_cancelled');

      const cot = wardOfBed(body.cotBedId);
      if (!cot) return badRequest('bed_not_found');
      if (!cot.bed.active) return conflict('bed_out_of_service');
      if (!NEWBORN_WARD_KINDS.includes(cot.ward.kind))
        return conflict('not_a_newborn_bed', { wardKind: cot.ward.kind });
      if (cot.bed.stay) return conflict('cot_occupied');

      const active = (id: string, role: 'doctor' | 'nurse') =>
        STAFF.some((s) => s.id === id && s.role === role && s.isActive);
      for (const id of [body.primaryDoctorId, ...body.team.doctorIds])
        if (!active(id, 'doctor')) return badRequest('not_an_active_doctor');
      for (const id of body.team.nurseIds)
        if (!active(id, 'nurse')) return badRequest('not_an_active_nurse');

      const now = nowIso();
      const bornAt = (body.bornAt ?? new Date()).toISOString();
      const mother = patientById(d.motherPatientId)!;
      const birthOrder = d.births.length + 1;

      // what the saga's register_patient step does in apps/patients
      const baby: FakePatient = {
        id: newId(),
        mrn: `MRN-${String(300000 + db.patients.length * 13)}`,
        firstName: null,
        lastName: mother.lastName,
        dateOfBirth: zagrebDay(new Date(bornAt)),
        bornAt,
        sex: body.sex,
        oib: null,
        mbo: null,
        email: null,
        phone: null,
        address: mother.address,
        bloodType: null,
        deceasedAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      db.patients.push(baby);
      db.relations.push({ childId: baby.id, motherId: mother.id });

      // the team: whoever registers + the ones ticked (append-only, no duplicates)
      const team = new Map<string, 'doctor' | 'nurse'>([
        [staff.id, staff.role as 'doctor' | 'nurse'],
        ...body.team.doctorIds.map((id) => [id, 'doctor'] as const),
        ...body.team.nurseIds.map((id) => [id, 'nurse'] as const),
      ]);
      for (const [staffId, role] of team)
        if (!d.team.some((t) => t.staffId === staffId))
          d.team.push({ staffId, role, addedAt: now });

      // grant_access step: primary doctor for good, the team for the first hour
      const endsAt = new Date(
        Date.now() + DELIVERY_ACCESS_MINUTES * 60_000,
      ).toISOString();
      db.grants.push({
        staffId: body.primaryDoctorId,
        patientId: baby.id,
        kind: 'primary',
        endsAt: null,
      });
      for (const staffId of team.keys())
        db.grants.push({
          staffId,
          patientId: baby.id,
          kind: 'delivery',
          endsAt,
        });

      // the baby's admission: a cot (bed_stays tracks moves like any bed)
      const babyAdmissionId = newId();
      cot.bed.stay = {
        admissionId: babyAdmissionId,
        patientId: baby.id,
        since: now,
      };
      // open_encounter step (apps/clinical)
      db.encounters.push(
        newbornEncounter(newId(), baby.id, body.primaryDoctorId, now),
      );

      d.births.push({
        babyPatientId: baby.id,
        birthOrder,
        sex: body.sex,
        bornAt,
        primaryDoctorId: body.primaryDoctorId,
        babyAdmissionId,
        readyAt: new Date(Date.now() + SAGA_MS).toISOString(),
      });
      if (d.status === 'in_labor')
        Object.assign(d, { status: 'delivered', deliveredAt: bornAt });
      d.version++;
      mockDb.save();
      return HttpResponse.json(
        {
          babyPatientId: baby.id,
          birthOrder,
          label: letter(birthOrder),
          babyAdmissionId,
          delivery: deliveryView(d),
        },
        { status: 202 },
      );
    },
  ),

  /** The fake saga never fails, so there is never anything to retry. */
  http.post(
    '/api/admissions/deliveries/:id/births/:babyPatientId/retry',
    async ({ request, params }) => {
      await delay();
      const staff = guard(request, ['doctor', 'nurse']);
      if (staff instanceof Response) return staff;
      const d = mockDb.get().deliveries.find((x) => x.id === params.id);
      if (!d || !canSeePatient(staff, d.motherPatientId))
        return notFound('delivery_not_found');
      if (!d.births.some((b) => b.babyPatientId === params.babyPatientId))
        return notFound('birth_not_found');
      return conflict('nothing_to_retry');
    },
  ),

  /** Bed board: free/occupied for everyone, WHO only for the patient's own care team */
  http.get('/api/admissions/wards/:id/beds', async ({ request, params }) => {
    await delay();
    const staff = guard(request, ['doctor', 'nurse', 'receptionist', 'admin']);
    if (staff instanceof Response) return staff;
    const ward = WARDS.find((w) => w.id === params.id);
    if (!ward) return notFound('ward_not_found');
    return HttpResponse.json({
      ward,
      beds: mockDb
        .get()
        .beds.filter((b) => b.wardId === ward.id)
        .map((b) => ({
          bedId: b.bedId,
          bed: b.bed,
          room: b.room,
          state: !b.active ? 'out_of_service' : b.stay ? 'occupied' : 'free',
          ...(b.stay && canSeePatient(staff, b.stay.patientId) ? b.stay : {}),
        })),
    });
  }),

  /** A doctor's schedule: front desk any doctor, a doctor only their own, a nurse her doctors' */
  http.get(
    '/api/admissions/doctors/:doctorId/appointments',
    async ({ request, params }) => {
      await delay();
      const staff = guard(request, [
        'doctor',
        'nurse',
        'receptionist',
        'admin',
      ]);
      if (staff instanceof Response) return staff;
      const doctorId = String(params.doctorId);
      const allowed =
        staff.role === 'receptionist' ||
        staff.role === 'admin' ||
        (staff.role === 'doctor' && staff.id === doctorId) ||
        (staff.role === 'nurse' && NURSE_DOCTORS[staff.id]?.includes(doctorId));
      if (!allowed)
        return HttpResponse.json({ error: 'forbidden' }, { status: 403 });

      const url = new URL(request.url);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (!from || !to || to < from) return badRequest();
      const start = new Date(`${from}T00:00:00`).getTime();
      const end = new Date(`${to}T00:00:00`).getTime() + 86_400_000;
      return HttpResponse.json({
        items: APPOINTMENTS.filter(
          (a) =>
            a.doctorId === doctorId &&
            Date.parse(a.startsAt) >= start &&
            Date.parse(a.startsAt) < end,
        )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .map(({ doctorId: _, ...a }) => {
            const p = patientById(a.patientId)!;
            // NOT IN THE BACKEND YET: a schedule without names is useless at the desk, and a
            // doctor can't look up patients not assigned to them. Backend should add this.
            return {
              ...a,
              patient: {
                mrn: p.mrn,
                firstName: p.firstName,
                lastName: p.lastName,
              },
            };
          }),
      });
    },
  ),
];
