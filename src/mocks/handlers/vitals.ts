import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';
import { OBSERVATION_UNITS, RANGES } from '../data/vitals';
import type { FakeObservation, ObservationType } from '../data/vitals';
import { mockDb, newId } from '../db';
import { chartAccess, conflict, notFound, validationError } from './guard';

const P = '/api/clinical/patients/:patientId';
const TYPES = Object.keys(OBSERVATION_UNITS) as [
  ObservationType,
  ...ObservationType[],
];

/** apps/clinical vitals.service.ts: plausible ranges, bp needs a lower diastolic */
const Reading = z
  .object({
    type: z.enum(TYPES),
    value: z.number(),
    value2: z.number().optional(),
  })
  .superRefine((r, ctx) => {
    const [min, max] = RANGES[r.type];
    if (r.value < min || r.value > max)
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: `${r.type} must be between ${min} and ${max}`,
      });
    if (
      (r.type === 'pain' || r.type.startsWith('apgar_')) &&
      !Number.isInteger(r.value)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: `${r.type} is a whole number 0-10`,
      });
    if (r.type === 'bp') {
      if (
        r.value2 === undefined ||
        r.value2 < 20 ||
        r.value2 > 200 ||
        r.value2 >= r.value
      )
        ctx.addIssue({
          code: 'custom',
          path: ['value2'],
          message: 'diastolic 20-200 and lower than systolic',
        });
    } else if (r.value2 !== undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['value2'],
        message: 'only for bp',
      });
  });
const RecordVitalsBody = z.object({
  readings: z.array(Reading).min(1).max(20),
  recordedAt: z.coerce.date().optional(),
});

const view = ({ patientId: _, ...o }: FakeObservation) => o;

export const vitalsHandlers = [
  /** One bedside round: several readings, one time, in an open visit */
  http.post(
    `${P}/encounters/:encounterId/vitals`,
    async ({ request, params }) => {
      await delay();
      const access = chartAccess(request, params, ['doctor', 'nurse']);
      if (access instanceof Response) return access;
      const parsed = RecordVitalsBody.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success) return validationError(parsed.error);
      const e = mockDb
        .get()
        .encounters.find(
          (x) =>
            x.id === params.encounterId && x.patientId === access.patientId,
        );
      if (!e) return notFound('encounter_not_found');
      if (e.status !== 'in_progress')
        return conflict('encounter_closed', { status: e.status });
      const at = (parsed.data.recordedAt ?? new Date()).toISOString();
      const saved = parsed.data.readings.map((r): FakeObservation => ({
        id: newId(),
        patientId: access.patientId,
        encounterId: e.id,
        type: r.type,
        value: r.value,
        value2: r.value2 ?? null,
        unit: OBSERVATION_UNITS[r.type],
        status: 'active',
        errorReason: null,
        recordedBy: access.staff.id,
        recordedAt: at,
      }));
      mockDb.get().observations.push(...saved);
      mockDb.save();
      return HttpResponse.json({ items: saved.map(view) }, { status: 201 });
    },
  ),

  /** Newest first; ?type= one vital sign; ?from&to a time range */
  http.get(`${P}/vitals`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const q = new URL(request.url).searchParams;
    const type = q.get('type');
    const from = q.get('from');
    const to = q.get('to');
    return HttpResponse.json({
      items: mockDb
        .get()
        .observations.filter(
          (o) =>
            o.patientId === access.patientId &&
            (!type || o.type === type) &&
            (!from || o.recordedAt >= new Date(from).toISOString()) &&
            (!to || o.recordedAt < new Date(to).toISOString()),
        )
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
        .map(view),
    });
  }),

  /** A wrong reading is never deleted: it becomes entered_in_error with a reason */
  http.post(`${P}/vitals/:id/void`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const parsed = z
      .object({ reason: z.string().trim().min(3).max(200) })
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error);
    const o = mockDb
      .get()
      .observations.find(
        (x) => x.id === params.id && x.patientId === access.patientId,
      );
    if (!o) return notFound('observation_not_found');
    if (o.status !== 'active') return conflict('already_entered_in_error');
    Object.assign(o, {
      status: 'entered_in_error',
      errorReason: parsed.data.reason,
    });
    mockDb.save();
    return HttpResponse.json(view(o));
  }),
];
