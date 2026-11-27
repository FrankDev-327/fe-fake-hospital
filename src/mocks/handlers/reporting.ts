import { delay, http, HttpResponse } from 'msw';
import { WARDS } from '../data/admissions';
import { mockDb } from '../db';
import type { StaffRole } from '@/auth/types';
import { isoDay } from '@/lib/format';
import {
  AGE_GROUPS,
  daysBetween,
  factsFor,
  HISTORY_DAYS,
} from '../data/reporting';
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
    const p = period(request, ['admin', 'doctor']);
    if (p instanceof Response) return p;
    return HttpResponse.json({
      period: { from: p.from, to: p.to },
      days: p.days.flatMap((d) =>
        Object.entries(factsFor(d).critical).map(([testCode, n]) => ({
          day: d,
          testCode,
          count: suppress(n),
        })),
      ),
    });
  }),

  /** Same shape as the backend: per ward, admissions/discharges/average stay in the period */
  http.get('/api/reporting/reports/admissions', async ({ request }) => {
    await delay();
    const p = period(request, ['admin', 'doctor']);
    if (p instanceof Response) return p;
    return HttpResponse.json({
      period: { from: p.from, to: p.to },
      wards: WARDS.map((w) => {
        let admissions = 0;
        let discharges = 0;
        let stay = 0;
        for (const d of p.days) {
          const f = factsFor(d).wards[w.code]!;
          admissions += f.admissions;
          discharges += f.discharges;
          stay += f.stayDays;
        }
        return {
          code: w.code,
          name: w.name,
          admissions,
          discharges,
          avgLengthOfStayDays: discharges
            ? Math.round((stay / discharges) * 10) / 10
            : null,
        };
      }),
    });
  }),

  /** Same shape as the backend: diagnoses made in the period, by ICD-10 code ("<5" hidden) */
  http.get('/api/reporting/reports/diagnoses', async ({ request }) => {
    await delay();
    const p = period(request, ['admin', 'doctor']);
    if (p instanceof Response) return p;
    const totals = sumRecords(p.days.map((d) => factsFor(d).diagnoses));
    return HttpResponse.json({
      period: { from: p.from, to: p.to },
      note: 'counts below 5 are shown as "<5"',
      codes: Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(([icd10Code, n]) => ({ icd10Code, count: suppress(n) })),
    });
  }),

  /** Same shape as the backend (one row per doctor; here all doctors summed in one row) */
  http.get('/api/reporting/reports/appointments', async ({ request }) => {
    await delay();
    const p = period(request, ['admin', 'doctor']);
    if (p instanceof Response) return p;
    const s = { booked: 0, completed: 0, noShow: 0, cancelled: 0 };
    for (const d of p.days) {
      const a = factsFor(d).appointments;
      s.booked += a.booked;
      s.completed += a.completed;
      s.noShow += a.noShow;
      s.cancelled += a.cancelled;
    }
    const tookPlace = s.completed + s.noShow;
    return HttpResponse.json({
      period: { from: p.from, to: p.to },
      doctors: [
        {
          doctorId: null,
          ...s,
          noShowRate: tookPlace
            ? Math.round((s.noShow / tookPlace) * 1000) / 10
            : null,
        },
      ],
    });
  }),

  /**
   * Numbers PER DAY for the charts. Optional ?ward=CODE limits admissions/discharges/age groups to one ward.
   */
  http.get('/api/reporting/reports/trends', async ({ request }) => {
    await delay();
    const p = period(request, ['admin', 'doctor']);
    if (p instanceof Response) return p;
    const ward = new URL(request.url).searchParams.get('ward');
    if (ward && !WARDS.some((w) => w.code === ward)) return badRequest();
    const codes = ward ? [ward] : WARDS.map((w) => w.code);
    const ageGroups = AGE_GROUPS.map(() => 0);
    const days = p.days.map((d) => {
      const f = factsFor(d);
      let admissions = 0;
      let discharges = 0;
      for (const c of codes) {
        const w = f.wards[c]!;
        admissions += w.admissions;
        discharges += w.discharges;
        w.ageGroups.forEach((n, i) => (ageGroups[i]! += n));
      }
      return {
        day: d,
        admissions,
        discharges,
        birthsFemale: f.births.female,
        birthsMale: f.births.male,
        newPatients: f.newPatients,
        dosesGiven: f.doses.given,
        dosesSkipped: f.doses.skipped,
        dosesRefused: f.doses.refused,
      };
    });
    return HttpResponse.json({
      period: { from: p.from, to: p.to },
      ward,
      days,
      ageGroups: AGE_GROUPS.map((group, i) => ({ group, count: ageGroups[i] })),
    });
  }),

  /** The most given drugs in the period (doses given) */
  http.get('/api/reporting/reports/medication', async ({ request }) => {
    await delay();
    const p = period(request, ['admin', 'doctor']);
    if (p instanceof Response) return p;
    const totals = sumRecords(p.days.map((d) => factsFor(d).dosesByDrug));
    return HttpResponse.json({
      period: { from: p.from, to: p.to },
      drugs: Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, dosesGiven]) => ({ name, dosesGiven })),
    });
  }),
];

/** ?from&to like the backend's PeriodQuery: dates, to >= from, at most 366 days */
function period(request: Request, roles: StaffRole[]) {
  const staff = guard(request, roles);
  if (staff instanceof Response) return staff;
  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (
    !iso.test(from) ||
    !iso.test(to) ||
    to < from ||
    (Date.parse(to) - Date.parse(from)) / 86_400_000 > 366
  )
    return badRequest();
  // no data before the fake history starts or after today
  const today = isoDay(new Date());
  const first = isoDay(new Date(Date.now() - HISTORY_DAYS * 86_400_000));
  const days = daysBetween(from, to).filter((d) => d >= first && d <= today);
  return { from, to, days };
}

function sumRecords(records: Record<string, number>[]) {
  const out: Record<string, number> = {};
  for (const r of records)
    for (const [k, v] of Object.entries(r)) out[k] = (out[k] ?? 0) + v;
  return out;
}
