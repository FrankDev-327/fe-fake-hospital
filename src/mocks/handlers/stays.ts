import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';
import type { StaffRole } from '@/auth/types';
import { WARDS } from '../data/admissions';
import { admissionView, ensureAdmissions } from '../admissions-store';
import type { FakeAdmission } from '../admissions-store';
import { mockDb, newId, nowIso } from '../db';
import { live } from '../live';
import {
  badRequest,
  canSeePatient,
  conflict,
  guard,
  notFound,
  validationError,
} from './guard';

/**
 * Hospital stays: admit, transfer, discharge (a saga: close the visit in clinical, stop the
 * medication, then free the bed), plus the live stream. Same URLs, bodies and errors as
 * apps/admissions and apps/live. Fake data only.
 */

/** time between saga steps, so the screen can show them one by one */
const STEP_MS = import.meta.env.MODE === 'test' ? 0 : 1500;

const wardOf = (wardId: string) => {
  const w = WARDS.find((x) => x.id === wardId)!;
  return { id: w.id, code: w.code, name: w.name };
};

const store = () => {
  const db = mockDb.get();
  ensureAdmissions(db, () => newId()); // babies the birth saga put into cots
  return db;
};

const view = (a: FakeAdmission) => admissionView(a, mockDb.get().beds, wardOf);

/** save + tell the open screens (here and in other tabs) */
function changed(a: FakeAdmission) {
  a.version++;
  mockDb.save();
  live.publish({ type: 'admission.changed', patientId: a.patientId, id: a.id });
}

/** The patient's admission, after the access check (404 for someone else's patient) */
function find(
  request: Request,
  patientId: string,
  id: string,
  roles: readonly StaffRole[],
) {
  const staff = guard(request, roles);
  if (staff instanceof Response) return staff;
  if (!canSeePatient(staff, patientId)) return notFound('patient_not_found');
  const a = store().admissions.find(
    (x) => x.id === id && x.patientId === patientId,
  );
  return a ? { staff, a } : notFound('admission_not_found');
}

const freeBed = (bedId: string) => {
  const bed = mockDb.get().beds.find((b) => b.bedId === bedId);
  if (!bed) return notFound('bed_not_found');
  if (!bed.active || bed.stay) return conflict('bed_not_free');
  return bed;
};

/** The fake saga: one step after another, each one saved and pushed live */
function runDischarge(a: FakeAdmission) {
  const steps = a.discharge!.steps;
  const next = (i: number) =>
    setTimeout(() => {
      const db = mockDb.get();
      const step = steps[i];
      if (a.status !== 'discharging') return; // aborted meanwhile
      if (!step) {
        // all done: the bed is free, the stay is over
        const bed = db.beds.find((b) => b.bedId === a.bedId);
        if (bed) bed.stay = null;
        a.bedId = null;
        a.status = 'discharged';
        a.dischargedAt = nowIso();
        changed(a);
        return;
      }
      if (step.step === 'close_encounter') {
        const visit = db.encounters.find((e) => e.id === a.encounterId);
        if (visit && visit.status === 'in_progress') {
          visit.status = 'finished';
          visit.endedAt = nowIso();
          visit.version++;
        }
      } else {
        for (const rx of db.prescriptions)
          if (rx.patientId === a.patientId && rx.status === 'active') {
            rx.status = 'stopped';
            rx.stoppedAt = nowIso();
            rx.stoppedBy = a.discharge!.requestedBy;
            rx.stopReason = 'Discharged';
          }
      }
      step.status = 'done';
      const after = steps[i + 1];
      if (after) after.status = 'pending';
      changed(a);
      next(i + 1);
    }, STEP_MS);
  next(steps.findIndex((s) => s.status !== 'done'));
}

const AdmitBody = z.object({ encounterId: z.uuid(), bedId: z.uuid() });
const TransferBody = z.object({
  bedId: z.uuid(),
  reason: z.string().trim().min(3).max(200).nullable().default(null),
});

const base = '/api/admissions/patients/:patientId/admissions';

export const staysHandlers = [
  http.get(base, async ({ request, params }) => {
    await delay();
    const staff = guard(request, ['doctor', 'nurse']);
    if (staff instanceof Response) return staff;
    const patientId = String(params.patientId);
    if (!canSeePatient(staff, patientId)) return notFound('patient_not_found');
    const items = store()
      .admissions.filter((a) => a.patientId === patientId)
      .sort((x, y) => y.admittedAt.localeCompare(x.admittedAt))
      .map(view);
    return HttpResponse.json({ items });
  }),

  http.post(base, async ({ request, params }) => {
    await delay();
    const staff = guard(request, ['doctor', 'nurse']);
    if (staff instanceof Response) return staff;
    const patientId = String(params.patientId);
    if (!canSeePatient(staff, patientId)) return notFound('patient_not_found');
    const body = AdmitBody.safeParse(await request.json().catch(() => null));
    if (!body.success) return validationError(body.error);
    const db = store();
    const visit = db.encounters.find(
      (e) => e.id === body.data.encounterId && e.patientId === patientId,
    );
    if (!visit) return notFound('encounter_not_found');
    if (visit.status !== 'in_progress') return conflict('encounter_not_open');
    if (
      db.admissions.some(
        (a) => a.patientId === patientId && a.status !== 'discharged',
      )
    )
      return conflict('already_admitted');
    const bed = freeBed(body.data.bedId);
    if (bed instanceof Response) return bed;
    const a: FakeAdmission = {
      id: newId(),
      patientId,
      encounterId: visit.id,
      status: 'active',
      bedId: bed.bedId,
      admittedBy: staff.id,
      admittedAt: nowIso(),
      discharge: null,
      dischargedAt: null,
      version: 0,
    };
    db.admissions.push(a);
    bed.stay = { admissionId: a.id, patientId, since: a.admittedAt };
    changed(a);
    return HttpResponse.json(view(a), { status: 201 });
  }),

  http.post(`${base}/:id/transfer`, async ({ request, params }) => {
    await delay();
    const found = find(request, String(params.patientId), String(params.id), [
      'doctor',
      'nurse',
    ]);
    if (found instanceof Response) return found;
    const { a } = found;
    if (a.status !== 'active') return conflict('admission_not_active');
    const body = TransferBody.safeParse(await request.json().catch(() => null));
    if (!body.success) return validationError(body.error);
    if (body.data.bedId === a.bedId) return badRequest('same_bed');
    const bed = freeBed(body.data.bedId);
    if (bed instanceof Response) return bed;
    const db = mockDb.get();
    const old = db.beds.find((b) => b.bedId === a.bedId);
    bed.stay = old?.stay ?? {
      admissionId: a.id,
      patientId: a.patientId,
      since: a.admittedAt,
    };
    if (old) old.stay = null;
    a.bedId = bed.bedId;
    changed(a);
    return HttpResponse.json(view(a));
  }),

  http.post(`${base}/:id/discharge`, async ({ request, params }) => {
    await delay();
    const found = find(request, String(params.patientId), String(params.id), [
      'doctor',
    ]);
    if (found instanceof Response) return found;
    const { staff, a } = found;
    if (a.status !== 'active') return conflict('admission_not_active');
    a.status = 'discharging';
    a.discharge = {
      requestedBy: staff.id,
      requestedAt: nowIso(),
      failure: null,
      steps: [
        { step: 'close_encounter', status: 'pending', detail: null },
        { step: 'stop_medication', status: 'waiting', detail: null },
      ],
    };
    changed(a);
    runDischarge(a);
    return HttpResponse.json(view(a), { status: 202 });
  }),

  http.post(`${base}/:id/discharge/retry`, async ({ request, params }) => {
    await delay();
    const found = find(request, String(params.patientId), String(params.id), [
      'doctor',
    ]);
    if (found instanceof Response) return found;
    const { a } = found;
    const stuck = a.discharge?.steps.find(
      (s) => s.status === 'timed_out' || s.status === 'failed',
    );
    if (a.status !== 'discharging' || !stuck)
      return conflict('nothing_to_retry');
    stuck.status = 'pending';
    a.discharge!.failure = null;
    changed(a);
    runDischarge(a);
    return HttpResponse.json(view(a), { status: 202 });
  }),

  http.post(`${base}/:id/discharge/abort`, async ({ request, params }) => {
    await delay();
    const found = find(request, String(params.patientId), String(params.id), [
      'doctor',
    ]);
    if (found instanceof Response) return found;
    const { a } = found;
    if (a.status !== 'discharging') return conflict('not_discharging');
    // once the visit is closed the discharge can only go forward
    if (
      a.discharge!.steps.some(
        (s) => s.step === 'close_encounter' && s.status === 'done',
      )
    )
      return conflict('encounter_already_closed');
    a.status = 'active';
    a.discharge = null;
    changed(a);
    return HttpResponse.json(view(a));
  }),

  /**
   * GET /api/live/stream?patients=<id>,<id> (apps/live). Sends `ready`, then a `change` event
   * for each change to a patient on the list (only the ones this user may see), and a
   * comment ping every 15 s so proxies don't close the connection.
   */
  http.get('/api/live/stream', ({ request }) => {
    const staff = guard(request, [
      'doctor',
      'nurse',
      'receptionist',
      'admin',
      'lab_tech',
      'pharmacist',
    ]);
    if (staff instanceof Response) return staff;
    const ids = (new URL(request.url).searchParams.get('patients') ?? '')
      .split(',')
      .filter(Boolean);
    if (ids.length > 50) return badRequest('patients_must_be_up_to_50_ids');
    const allowed = new Set(ids.filter((id) => canSeePatient(staff, id)));
    const encoder = new TextEncoder();
    let stop = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (text: string) => {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            stop(); // the screen went away
          }
        };
        write(
          `event: ready\ndata: ${JSON.stringify({ patients: allowed.size })}\n\n`,
        );
        const unsubscribe = live.subscribe((e) => {
          if (e.patientId && !allowed.has(e.patientId)) return;
          write(`event: change\ndata: ${JSON.stringify(e)}\n\n`);
        });
        const ping = setInterval(() => write(': ping\n\n'), 15_000);
        stop = () => {
          unsubscribe();
          clearInterval(ping);
        };
        request.signal.addEventListener('abort', () => stop());
      },
      cancel() {
        stop();
      },
    });
    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  }),
];
