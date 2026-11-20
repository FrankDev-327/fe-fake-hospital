import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';
import { ALLERGIES } from '../data/clinical';
import { MEDICATIONS } from '../data/medication';
import type { FakeAdministration, FakePrescription } from '../data/medication';
import { mockDb, newId, nowIso } from '../db';
import {
  badRequest,
  chartAccess,
  conflict,
  forbidden,
  guard,
  notFound,
  validationError,
} from './guard';

const P = '/api/medication/patients/:patientId/prescriptions';
const DOSE_UNITS = [
  'mg',
  'g',
  'mcg',
  'ml',
  'IU',
  'U',
  'tablet',
  'capsule',
  'drop',
  'puff',
] as const;
const ROUTES = [
  'oral',
  'iv',
  'im',
  'sc',
  'topical',
  'inhaled',
  'rectal',
  'sublingual',
] as const;
const reason = z.string().trim().min(3).max(200);

/** apps/medication prescriptions.service.ts PrescribeBody */
const PrescribeBody = z
  .object({
    encounterId: z.uuid(),
    medicationId: z.uuid(),
    doseAmount: z.number().positive().max(100_000),
    doseUnit: z.enum(DOSE_UNITS),
    route: z.enum(ROUTES),
    intervalHours: z.number().int().min(1).max(168).nullable().default(null),
    asNeeded: z.boolean().default(false),
    instructions: z.string().trim().min(1).max(1000).nullable().default(null),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().nullable().default(null),
    overrideReason: reason.nullable().default(null),
    acknowledgeWarnings: z.boolean().default(false),
  })
  .superRefine((b, ctx) => {
    if (!b.asNeeded && b.intervalHours === null)
      ctx.addIssue({
        code: 'custom',
        path: ['intervalHours'],
        message: 'required unless asNeeded',
      });
    const start = b.startsAt?.getTime() ?? Date.now();
    if (b.endsAt && b.endsAt.getTime() <= start)
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'must be after startsAt',
      });
  });

/** apps/medication administrations.service.ts RecordDoseBody */
const RecordDoseBody = z
  .object({
    idempotencyKey: z.uuid(),
    status: z.enum(['given', 'skipped', 'refused']),
    doseAmount: z.number().positive().max(100_000).optional(),
    doseUnit: z.string().optional(),
    administeredAt: z.coerce.date().optional(),
    scheduledFor: z.coerce.date().nullable().default(null),
    note: z.string().trim().min(3).max(1000).nullable().default(null),
    confirmEarlyDose: z.boolean().default(false),
  })
  .superRefine((b, ctx) => {
    if (b.status === 'given' && b.doseAmount === undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['doseAmount'],
        message: 'required when given',
      });
    if (b.status !== 'given' && !b.note)
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'say why the dose was skipped or refused',
      });
  });

const json = (request: Request) => request.json().catch(() => null);

const isCurrent = (p: FakePrescription) =>
  p.status === 'active' && (!p.endsAt || Date.parse(p.endsAt) > Date.now());

function view(p: FakePrescription) {
  const drug = MEDICATIONS.find((m) => m.id === p.medicationId)!;
  const lastGiven = mockDb
    .get()
    .administrations.filter(
      (a) => a.prescriptionId === p.id && a.status === 'given',
    )
    .map((a) => a.administeredAt)
    .sort()
    .at(-1);
  const { patientId: _, medicationId: __, ...rest } = p;
  return {
    ...rest,
    medication: {
      id: drug.id,
      name: drug.name,
      atcCode: drug.atcCode,
      form: drug.form,
      strength: drug.strength,
    },
    isCurrent: isCurrent(p),
    lastGivenAt: lastGiven ?? null,
  };
}

const doseView = ({
  patientId: _,
  idempotencyKey: __,
  ...a
}: FakeAdministration) => a;

/** The prescribing safety checks (prescribing-checks.ts). The fake allergy feed is always fresh. */
function checks(patientId: string, atcCode: string) {
  const blocking = [];
  const warnings = [];
  const allergies = ALLERGIES.filter(
    (a) => a.patientId === patientId && a.status === 'active',
  );
  const matches = allergies.filter(
    (a) => a.atcCode && atcCode.startsWith(a.atcCode),
  );
  if (matches.length)
    blocking.push({
      code: 'allergy_match',
      message: 'The patient has an active allergy to this drug or its group',
      details: {
        allergies: matches.map((a) => ({
          allergyId: a.id,
          atcCode: a.atcCode,
          severity: a.severity,
        })),
      },
    });
  const duplicates = mockDb
    .get()
    .prescriptions.filter(
      (p) =>
        p.patientId === patientId &&
        isCurrent(p) &&
        MEDICATIONS.find((m) => m.id === p.medicationId)?.atcCode === atcCode,
    );
  if (duplicates.length)
    warnings.push({
      code: 'duplicate_therapy',
      message:
        'The patient already has an active prescription of the same active ingredient',
      details: { prescriptionIds: duplicates.map((d) => d.id) },
    });
  const unchecked = allergies.filter((a) => !a.atcCode).length;
  if (unchecked)
    warnings.push({
      code: 'allergies_need_manual_check',
      message:
        'Some allergies are recorded as text only and could not be checked automatically',
      details: { count: unchecked },
    });
  return { blocking, warnings };
}

function findPrescription(patientId: string, id: unknown) {
  return mockDb
    .get()
    .prescriptions.find((p) => p.id === id && p.patientId === patientId);
}

/** apps/medication (/api/medication/...) */
export const medicationHandlers = [
  http.get(P, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const active = new URL(request.url).searchParams.get('active') !== 'false';
    return HttpResponse.json({
      items: mockDb
        .get()
        .prescriptions.filter(
          (p) => p.patientId === access.patientId && (!active || isCurrent(p)),
        )
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
        .map(view),
    });
  }),

  http.post(P, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor']);
    if (access instanceof Response) return access;
    const parsed = PrescribeBody.safeParse(await json(request));
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;

    const encounter = mockDb
      .get()
      .encounters.find(
        (e) => e.id === input.encounterId && e.patientId === access.patientId,
      );
    if (!encounter || encounter.status !== 'in_progress')
      return conflict('encounter_not_open', {
        status: encounter?.status ?? null,
      });
    const drug = MEDICATIONS.find((m) => m.id === input.medicationId);
    if (!drug) return badRequest('unknown_medication');

    const result = checks(access.patientId, drug.atcCode);
    if (result.blocking.length && !input.overrideReason)
      return conflict('prescription_blocked', {
        ...result,
        hint: 'give overrideReason to prescribe anyway',
      });
    if (result.warnings.length && !input.acknowledgeWarnings)
      return conflict('warnings_need_acknowledgement', result);

    const prescription: FakePrescription = {
      id: newId(),
      patientId: access.patientId,
      encounterId: input.encounterId,
      medicationId: drug.id,
      prescribedBy: access.staff.id,
      doseAmount: input.doseAmount.toFixed(3),
      doseUnit: input.doseUnit,
      route: input.route,
      intervalHours: input.intervalHours,
      asNeeded: input.asNeeded,
      instructions: input.instructions,
      startsAt: (input.startsAt ?? new Date()).toISOString(),
      endsAt: input.endsAt?.toISOString() ?? null,
      status: 'active',
      overrideReason: result.blocking.length ? input.overrideReason : null,
      stoppedBy: null,
      stoppedAt: null,
      stopReason: null,
    };
    mockDb.get().prescriptions.push(prescription);
    mockDb.save();
    return HttpResponse.json(
      {
        prescription: view(prescription),
        warnings: result.warnings,
        overridden: result.blocking,
      },
      { status: 201 },
    );
  }),

  http.get(`${P}/:id`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const p = findPrescription(access.patientId, params.id);
    return p ? HttpResponse.json(view(p)) : notFound('prescription_not_found');
  }),

  /** stop: any doctor of the patient. void (entered in error): only the prescriber, no doses given */
  ...(['stop', 'void'] as const).map((action) =>
    http.post(`${P}/:id/${action}`, async ({ request, params }) => {
      await delay();
      const access = chartAccess(request, params, ['doctor']);
      if (access instanceof Response) return access;
      const parsed = z.object({ reason }).safeParse(await json(request));
      if (!parsed.success) return validationError(parsed.error);
      const p = findPrescription(access.patientId, params.id);
      if (!p) return notFound('prescription_not_found');
      if (p.status !== 'active')
        return conflict('prescription_not_active', { status: p.status });
      if (action === 'void') {
        if (p.prescribedBy !== access.staff.id)
          return forbidden('only_the_prescriber_can_void');
        const given = mockDb
          .get()
          .administrations.filter(
            (a) => a.prescriptionId === p.id && a.status === 'given',
          ).length;
        if (given)
          return conflict('doses_already_given', {
            given,
            hint: 'stop it instead',
          });
      }
      Object.assign(p, {
        status: action === 'stop' ? 'stopped' : 'entered_in_error',
        stoppedBy: access.staff.id,
        stoppedAt: nowIso(),
        stopReason: parsed.data.reason,
      });
      mockDb.save();
      return HttpResponse.json(view(p));
    }),
  ),

  /** Record a dose. Same idempotencyKey again = the same dose (200), never a second one. */
  http.post(`${P}/:id/administrations`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['nurse', 'doctor']);
    if (access instanceof Response) return access;
    const parsed = RecordDoseBody.safeParse(await json(request));
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    const db = mockDb.get();

    const replay = db.administrations.find(
      (a) => a.idempotencyKey === input.idempotencyKey,
    );
    if (replay)
      return HttpResponse.json({
        replayed: true,
        administration: doseView(replay),
      });

    const p = findPrescription(access.patientId, params.id);
    if (!p) return notFound('prescription_not_found');
    const at = input.administeredAt ?? new Date();
    if (
      p.status !== 'active' ||
      at < new Date(p.startsAt) ||
      (p.endsAt && at > new Date(p.endsAt))
    )
      return conflict('prescription_not_running', {
        status: p.status,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
      });

    if (input.status === 'given') {
      const unit = input.doseUnit ?? p.doseUnit;
      if (unit !== p.doseUnit)
        return conflict('dose_unit_mismatch', {
          ordered: p.doseUnit,
          given: unit,
        });
      if (Number(input.doseAmount) !== Number(p.doseAmount) && !input.note)
        return conflict('dose_differs_from_order', {
          ordered: p.doseAmount,
          given: input.doseAmount,
          hint: 'add a note explaining the different dose',
        });
      if (p.intervalHours) {
        const last = db.administrations
          .filter(
            (a) =>
              a.prescriptionId === p.id &&
              a.status === 'given' &&
              new Date(a.administeredAt) <= at,
          )
          .map((a) => a.administeredAt)
          .sort()
          .at(-1);
        const minGapMs = (p.intervalHours * 3_600_000) / 2;
        if (
          last &&
          at.getTime() - Date.parse(last) < minGapMs &&
          !(input.confirmEarlyDose && input.note)
        )
          return conflict('dose_too_soon', {
            lastGivenAt: last,
            intervalHours: p.intervalHours,
            hint: 'confirmEarlyDose with a note to record it anyway',
          });
      }
    }

    const administration: FakeAdministration = {
      id: newId(),
      prescriptionId: p.id,
      patientId: access.patientId,
      administeredBy: access.staff.id,
      status: input.status,
      doseAmount:
        input.status === 'given' ? input.doseAmount!.toFixed(3) : null,
      doseUnit:
        input.status === 'given' ? (input.doseUnit ?? p.doseUnit) : null,
      scheduledFor: input.scheduledFor?.toISOString() ?? null,
      administeredAt: at.toISOString(),
      note: input.note,
      idempotencyKey: input.idempotencyKey,
      createdAt: nowIso(),
    };
    db.administrations.push(administration);
    mockDb.save();
    return HttpResponse.json(
      { replayed: false, administration: doseView(administration) },
      { status: 201 },
    );
  }),

  http.get(`${P}/:id/administrations`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const p = findPrescription(access.patientId, params.id);
    if (!p) return notFound('prescription_not_found');
    return HttpResponse.json({
      items: mockDb
        .get()
        .administrations.filter((a) => a.prescriptionId === p.id)
        .sort((a, b) => b.administeredAt.localeCompare(a.administeredAt))
        .map(doseView),
    });
  }),

  /** Drug catalog (reference data): ?q= 2+ chars, name / ingredient / ATC prefix, max 20 */
  http.get('/api/medication/medications', async ({ request }) => {
    await delay();
    const staff = guard(request, ['doctor', 'nurse', 'pharmacist']);
    if (staff instanceof Response) return staff;
    const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase();
    if (!q || q.length < 2) return badRequest();
    return HttpResponse.json(
      MEDICATIONS.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.activeIngredient.includes(q) ||
          m.atcCode.toLowerCase().startsWith(q),
      ).slice(0, 20),
    );
  }),
];
