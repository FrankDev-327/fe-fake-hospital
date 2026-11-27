import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';
import { flagFor, isCritical, LAB_TESTS } from '../data/lab';
import type { FakeLabOrder, FakeLabResult } from '../data/lab';
import { mockDb, newId, nowIso } from '../db';
import {
  badRequest,
  chartAccess,
  conflict,
  guard,
  notFound,
  validationError,
} from './guard';

const P = '/api/clinical/patients/:patientId';
const testCode = z
  .string()
  .trim()
  .regex(/^\d{1,7}-\d$/, 'LOINC code like 718-7');
const OrderLabBody = z.object({
  tests: z.array(testCode).min(1).max(30),
  priority: z.enum(['routine', 'urgent']).default('routine'),
});
const EnterResultsBody = z.object({
  results: z
    .array(
      z
        .object({
          testCode,
          value: z.number().optional(),
          valueText: z.string().trim().min(1).max(500).optional(),
        })
        .refine(
          (r) => (r.value === undefined) !== (r.valueText === undefined),
          'give value OR valueText',
        ),
    )
    .min(1)
    .max(30),
});

const json = (request: Request) => request.json().catch(() => null);

/** Current results only: a corrected result is replaced by its correction */
const currentResults = (orderId: string) => {
  const all = mockDb.get().labResults.filter((r) => r.labOrderId === orderId);
  return all.filter((r) => !all.some((c) => c.correctsId === r.id));
};

function resultView(r: FakeLabResult) {
  const { patientId: _, ...rest } = r;
  const critical = isCritical(r.flag);
  return {
    ...rest,
    critical,
    acknowledged: critical
      ? mockDb.get().criticalAcks.some((a) => a.labResultId === r.id)
      : undefined,
  };
}

/** Order + test names/units/ranges + current results (what a reader needs next to a value) */
function orderView(o: FakeLabOrder) {
  return {
    id: o.id,
    encounterId: o.encounterId,
    orderedBy: o.orderedBy,
    priority: o.priority,
    status: o.status,
    orderedAt: o.orderedAt,
    collectedAt: o.collectedAt,
    tests: o.tests.map((code) => {
      const t = LAB_TESTS.find((x) => x.code === code)!;
      return {
        code,
        name: t.name,
        unit: t.unit,
        refLow: t.refLow,
        refHigh: t.refHigh,
      };
    }),
    results: currentResults(o.id).map(resultView),
  };
}

function collect(o: FakeLabOrder | undefined) {
  if (!o) return notFound('lab_order_not_found');
  if (o.status !== 'ordered')
    return conflict('order_not_waiting_for_collection', { status: o.status });
  Object.assign(o, { status: 'collected', collectedAt: nowIso() });
  mockDb.save();
  return HttpResponse.json(orderView(o));
}

const patientOrder = (patientId: string, id: unknown) =>
  mockDb.get().labOrders.find((o) => o.id === id && o.patientId === patientId);

export const labHandlers = [
  /** The test catalog for the order form and names everywhere */
  http.get('/api/clinical/lab-tests', async ({ request }) => {
    await delay();
    const staff = guard(request);
    if (staff instanceof Response) return staff;
    return HttpResponse.json(LAB_TESTS);
  }),

  // ---------- doctor / nurse (treating team) ----------
  http.post(
    `${P}/encounters/:encounterId/lab-orders`,
    async ({ request, params }) => {
      await delay();
      const access = chartAccess(request, params, ['doctor']);
      if (access instanceof Response) return access;
      const parsed = OrderLabBody.safeParse(await json(request));
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
      const codes = [...new Set(parsed.data.tests)];
      const unknown = codes.filter((c) => !LAB_TESTS.some((t) => t.code === c));
      if (unknown.length)
        return HttpResponse.json(
          { error: 'unknown_lab_tests', tests: unknown },
          { status: 400 },
        );
      const order: FakeLabOrder = {
        id: newId(),
        patientId: access.patientId,
        encounterId: e.id,
        orderedBy: access.staff.id,
        priority: parsed.data.priority,
        status: 'ordered',
        orderedAt: nowIso(),
        collectedAt: null,
        tests: codes,
      };
      mockDb.get().labOrders.push(order);
      mockDb.save();
      return HttpResponse.json(orderView(order), { status: 201 });
    },
  ),

  /** The patient's orders with tests and current results, newest first */
  http.get(`${P}/lab-orders`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    return HttpResponse.json({
      items: mockDb
        .get()
        .labOrders.filter((o) => o.patientId === access.patientId)
        .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
        .map(orderView),
    });
  }),

  /** Sample taken on the ward */
  http.post(`${P}/lab-orders/:id/collect`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['nurse', 'doctor']);
    if (access instanceof Response) return access;
    return collect(patientOrder(access.patientId, params.id));
  }),

  http.post(`${P}/lab-orders/:id/cancel`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor']);
    if (access instanceof Response) return access;
    const o = patientOrder(access.patientId, params.id);
    if (!o) return notFound('lab_order_not_found');
    if (o.status === 'resulted' || o.status === 'cancelled')
      return conflict('order_closed', { status: o.status });
    if (currentResults(o.id).length) return conflict('order_has_results');
    o.status = 'cancelled';
    mockDb.save();
    return HttpResponse.json(orderView(o));
  }),

  /** One test's trend for charts (?testCode=), newest first */
  http.get(`${P}/lab-results`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const code = new URL(request.url).searchParams.get('testCode');
    if (!code || !/^\d{1,7}-\d$/.test(code)) return badRequest();
    const all = mockDb
      .get()
      .labResults.filter(
        (r) => r.patientId === access.patientId && r.testCode === code,
      );
    return HttpResponse.json({
      items: all
        .filter((r) => !all.some((c) => c.correctsId === r.id))
        .sort((a, b) => b.resultedAt.localeCompare(a.resultedAt))
        .map(resultView),
    });
  }),

  /** "I've seen this critical result": once, critical results only */
  http.post(`${P}/lab-results/:id/acknowledge`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor']);
    if (access instanceof Response) return access;
    const r = mockDb
      .get()
      .labResults.find(
        (x) => x.id === params.id && x.patientId === access.patientId,
      );
    if (!r) return notFound('lab_result_not_found');
    if (!isCritical(r.flag)) return conflict('not_a_critical_result');
    const { criticalAcks } = mockDb.get();
    if (criticalAcks.some((a) => a.labResultId === r.id))
      return conflict('already_acknowledged');
    const ack = {
      labResultId: r.id,
      acknowledgedBy: access.staff.id,
      acknowledgedAt: nowIso(),
    };
    criticalAcks.push(ack);
    mockDb.save();
    return HttpResponse.json(ack, { status: 201 });
  }),

  // ---------- lab technician (worklist across all patients, ids only) ----------
  http.get('/api/clinical/lab/worklist', async ({ request }) => {
    await delay();
    const staff = guard(request, ['lab_tech']);
    if (staff instanceof Response) return staff;
    const status =
      new URL(request.url).searchParams.get('status') ?? 'collected';
    if (status !== 'ordered' && status !== 'collected') return badRequest();
    const items = mockDb
      .get()
      .labOrders.filter((o) => o.status === status)
      .sort(
        (a, b) =>
          (a.priority === b.priority ? 0 : a.priority === 'urgent' ? -1 : 1) ||
          a.orderedAt.localeCompare(b.orderedAt),
      )
      .slice(0, 100)
      .map((o) => ({
        id: o.id,
        patientId: o.patientId,
        priority: o.priority,
        status: o.status,
        orderedAt: o.orderedAt,
        collectedAt: o.collectedAt,
        tests: o.tests,
      }));
    return HttpResponse.json({ items });
  }),

  http.post(
    '/api/clinical/lab/orders/:id/collect',
    async ({ request, params }) => {
      await delay();
      const staff = guard(request, ['lab_tech']);
      if (staff instanceof Response) return staff;
      return collect(mockDb.get().labOrders.find((o) => o.id === params.id));
    },
  ),

  /** Results for a collected order. Each test once; all tests in -> order "resulted". */
  http.post(
    '/api/clinical/lab/orders/:id/results',
    async ({ request, params }) => {
      await delay();
      const staff = guard(request, ['lab_tech']);
      if (staff instanceof Response) return staff;
      const parsed = EnterResultsBody.safeParse(await json(request));
      if (!parsed.success) return validationError(parsed.error);
      const o = mockDb.get().labOrders.find((x) => x.id === params.id);
      if (!o) return notFound('lab_order_not_found');
      if (o.status !== 'collected')
        return conflict('order_not_collected', { status: o.status });
      const codes = parsed.data.results.map((r) => r.testCode);
      const notInOrder = codes.filter((c) => !o.tests.includes(c));
      if (notInOrder.length)
        return conflict('tests_not_in_order', { tests: notInOrder });
      const already = currentResults(o.id).map((r) => r.testCode);
      const twice = codes.filter((c) => already.includes(c));
      if (twice.length)
        return conflict('result_already_entered', { tests: twice });

      const saved = parsed.data.results.map((input): FakeLabResult => {
        const test = LAB_TESTS.find((t) => t.code === input.testCode)!;
        return {
          id: newId(),
          labOrderId: o.id,
          patientId: o.patientId,
          testCode: test.code,
          value: input.value ?? null,
          valueText: input.valueText ?? null,
          unit: test.unit,
          flag: input.value === undefined ? null : flagFor(test, input.value),
          correctsId: null,
          correctionReason: null,
          resultedBy: staff.id,
          resultedAt: nowIso(),
        };
      });
      mockDb.get().labResults.push(...saved);
      const remaining = o.tests.filter(
        (c) => !already.includes(c) && !codes.includes(c),
      );
      if (!remaining.length) o.status = 'resulted';
      mockDb.save();
      return HttpResponse.json(
        {
          orderStatus: remaining.length ? 'collected' : 'resulted',
          results: saved.map(resultView),
        },
        { status: 201 },
      );
    },
  ),
];
