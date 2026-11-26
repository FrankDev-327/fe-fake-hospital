import { delay, http, HttpResponse } from 'msw';
import { WARDS } from '../data/admissions';
import { mockDb } from '../db';
import { daysFromNow } from '../data/ids';
import { badRequest, guard } from './guard';

const rate = (occupied: number, beds: number) =>
  beds ? Math.round((occupied / beds) * 1000) / 10 : null;

/** small counts are hidden as "<5" (no exact small numbers in reports) */
const suppress = (n: number): number | '<5' => (n < 5 ? '<5' : n);

/** apps/reporting (/api/reporting/...): numbers only, never patients */
export const reportingHandlers = [
  http.get('/api/reporting/reports/occupancy', async ({ request }) => {
    await delay();
    const staff = guard(request, ['admin', 'doctor', 'nurse']);
    if (staff instanceof Response) return staff;
    const wards = WARDS.map((w) => {
      const beds = mockDb
        .get()
        .beds.filter((b) => b.wardId === w.id && b.active);
      const occupied = beds.filter((b) => b.stay).length;
      return {
        wardId: w.id,
        code: w.code,
        name: w.name,
        bedsInService: beds.length,
        occupied,
        occupancyRate: rate(occupied, beds.length),
      };
    });
    const bedsInService = wards.reduce((s, w) => s + w.bedsInService, 0);
    const occupied = wards.reduce((s, w) => s + w.occupied, 0);
    return HttpResponse.json({
      wards,
      total: {
        bedsInService,
        occupied,
        occupancyRate: rate(occupied, bedsInService),
      },
    });
  }),

  /** Critical lab results per day and test */
  http.get('/api/reporting/reports/critical-results', async ({ request }) => {
    await delay();
    const staff = guard(request, ['admin', 'doctor']);
    if (staff instanceof Response) return staff;
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to || to < from) return badRequest();
    // LOINC codes: 2823-3 potassium, 2345-7 glucose, 6301-6 INR, 718-7 hemoglobin
    const counts: [number, string, number][] = [
      [-6, '2823-3', 7],
      [-6, '2345-7', 2],
      [-5, '2823-3', 5],
      [-4, '6301-6', 9],
      [-4, '2823-3', 3],
      [-3, '2345-7', 6],
      [-2, '2823-3', 8],
      [-2, '718-7', 4],
      [-1, '6301-6', 5],
      [0, '2823-3', 2],
    ];
    return HttpResponse.json({
      period: { from, to },
      days: counts.map(([day, testCode, n]) => ({
        day: daysFromNow(day).slice(0, 10),
        testCode,
        count: suppress(n),
      })),
    });
  }),
];
