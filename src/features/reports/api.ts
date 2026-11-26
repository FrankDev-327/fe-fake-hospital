import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Reports are numbers only: no patient appears here. Small counts come as "<5". */
export type Small = number | '<5';

export interface Period {
  from: string;
  to: string;
}

export interface Occupancy {
  wards: {
    wardId: string;
    code: string;
    name: string;
    bedsInService: number;
    occupied: number;
    occupancyRate: number | null;
  }[];
  total: {
    bedsInService: number;
    occupied: number;
    occupancyRate: number | null;
  };
}

export interface TrendDay {
  day: string;
  admissions: number;
  discharges: number;
  birthsFemale: number;
  birthsMale: number;
  newPatients: number;
  dosesGiven: number;
  dosesSkipped: number;
  dosesRefused: number;
}

export interface Trends {
  days: TrendDay[];
  ageGroups: { group: string; count: number }[];
}

export interface AdmissionFlow {
  wards: {
    code: string;
    name: string;
    admissions: number;
    discharges: number;
    avgLengthOfStayDays: number | null;
  }[];
}

const query = (p: Period, extra = '') => `from=${p.from}&to=${p.to}${extra}`;

/** keepPreviousData: changing the filter keeps the old charts on screen until the new numbers come */
function useReport<T>(name: string, p: Period, extra = '', enabled = true) {
  return useQuery({
    queryKey: ['reports', name, p.from, p.to, extra],
    queryFn: ({ signal }) =>
      api<T>(`/reporting/reports/${name}?${query(p, extra)}`, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000, // reports change slowly
    enabled,
  });
}

export const useOccupancy = () =>
  useQuery({
    queryKey: ['reports', 'occupancy'],
    queryFn: ({ signal }) =>
      api<Occupancy>('/reporting/reports/occupancy', { signal }),
  });

/** NOT IN THE BACKEND YET (mocked): numbers per day */
export const useTrends = (p: Period, ward: string, enabled = true) =>
  useReport<Trends>('trends', p, ward ? `&ward=${ward}` : '', enabled);

export const useAdmissionFlow = (p: Period) =>
  useReport<AdmissionFlow>('admissions', p);

/** NOT IN THE BACKEND YET (mocked): most given drugs */
export const useTopMedication = (p: Period) =>
  useReport<{ drugs: { name: string; dosesGiven: number }[] }>('medication', p);

export const useDiagnosisCounts = (p: Period) =>
  useReport<{ codes: { icd10Code: string; count: Small }[] }>('diagnoses', p);

export const useCriticalResults = (p: Period) =>
  useReport<{ days: { day: string; testCode: string; count: Small }[] }>(
    'critical-results',
    p,
  );

export const useAppointmentStats = (p: Period) =>
  useReport<{
    doctors: {
      booked: number;
      completed: number;
      noShow: number;
      cancelled: number;
      noShowRate: number | null;
    }[];
  }>('appointments', p);

// ---------------- helpers for the charts ----------------

export type Bucket = 'day' | 'week' | 'month';

const DAY = 86_400_000;
export const periodDays = (p: Period) =>
  Math.round((Date.parse(p.to) - Date.parse(p.from)) / DAY) + 1;

/** Long periods are summed per week or month, so a chart never has hundreds of thin bars */
export const bucketFor = (p: Period): Bucket => {
  const n = periodDays(p);
  return n <= 62 ? 'day' : n <= 190 ? 'week' : 'month';
};

/** The bucket a day falls in: the day itself, the Monday of its week, or the 1st of its month */
export function bucketStart(day: string, bucket: Bucket) {
  if (bucket === 'day') return day;
  if (bucket === 'month') return `${day.slice(0, 7)}-01`;
  const d = new Date(`${day}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - back * DAY).toISOString().slice(0, 10);
}

/** Sum every numeric field of the rows per bucket */
export function sumByBucket<T extends { day: string }>(
  rows: T[],
  bucket: Bucket,
) {
  const out = new Map<string, Record<string, number | string>>();
  for (const row of rows) {
    const key = bucketStart(row.day, bucket);
    const acc = out.get(key) ?? { day: key };
    for (const [k, v] of Object.entries(row))
      if (typeof v === 'number') acc[k] = ((acc[k] as number) ?? 0) + v;
    out.set(key, acc);
  }
  return [...out.values()] as (Record<string, number> & { day: string })[];
}

export const sum = <T>(rows: T[], pick: (r: T) => number) =>
  rows.reduce((s, r) => s + pick(r), 0);

/** The period of the same length just before this one (for "vs previous period") */
export function previousPeriod(p: Period): Period {
  const n = periodDays(p);
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const from = Date.parse(`${p.from}T12:00:00Z`);
  return { from: day(from - n * DAY), to: day(from - DAY) };
}
