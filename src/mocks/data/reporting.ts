import { WARDS } from './admissions';
import { ICD10 } from './icd10';
import { LAB_TESTS } from './lab';
import { MEDICATIONS } from './medication';

/**
 * Fake reporting read model: numbers per day, made up but stable (the same day always gives
 * the same numbers, so reloads and tests agree). No patient data, like the real reporting
 * service. History goes back 400 days.
 */
export const HISTORY_DAYS = 400;

/** Small seeded random generator: same seed -> same numbers */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Poisson-ish count around a mean */
const count = (r: () => number, mean: number) =>
  Math.max(
    0,
    Math.round(mean + (r() + r() + r() - 1.5) * Math.sqrt(mean) * 1.2),
  );

const dayNumber = (day: string) =>
  Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000);

export const AGE_GROUPS = [
  '0-1',
  '1-17',
  '18-39',
  '40-64',
  '65-79',
  '80+',
] as const;

/** Mean admissions per weekday per ward kind (fewer at weekends, more in winter) */
const WARD_MEAN: Record<string, number> = {
  general: 6,
  delivery: 3,
  maternity: 3, // mothers moved in from the delivery ward after the birth
  nursery: 0, // babies are "born here", counted as births
  nicu: 0,
};

/** Age profile of admissions per ward kind */
const AGE_WEIGHTS: Record<string, number[]> = {
  general: [0, 0.06, 0.14, 0.3, 0.32, 0.18],
  delivery: [0, 0.02, 0.83, 0.15, 0, 0],
  maternity: [0, 0.02, 0.83, 0.15, 0, 0],
};

const pickWeighted = (r: () => number, weights: number[]) => {
  let x = r() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i]!;
    if (x <= 0) return i;
  }
  return weights.length - 1;
};

// The drugs that get given most (top of the list = most doses)
const TOP_MEDS = MEDICATIONS.slice(0, 10).map((m, i) => ({
  name: m.name,
  mean: 60 / (i + 1.4),
}));

export interface DayFacts {
  day: string;
  wards: Record<
    string,
    {
      admissions: number;
      discharges: number;
      /** sum of lengths of stay (days) of the discharges, for the average */
      stayDays: number;
      ageGroups: number[];
    }
  >;
  births: { female: number; male: number };
  newPatients: number;
  doses: { given: number; skipped: number; refused: number };
  dosesByDrug: Record<string, number>;
  critical: Record<string, number>;
  diagnoses: Record<string, number>;
  appointments: {
    booked: number;
    completed: number;
    noShow: number;
    cancelled: number;
  };
}

const cache = new Map<string, DayFacts>();

export function factsFor(day: string): DayFacts {
  const hit = cache.get(day);
  if (hit) return hit;
  const n = dayNumber(day);
  const r = rng(n * 7919);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  const month = Number(day.slice(5, 7));
  const winter = month === 12 || month <= 2 ? 1.25 : 1; // flu season
  const busy = (weekend ? 0.6 : 1) * winter;

  const wards: DayFacts['wards'] = {};
  for (const w of WARDS) {
    const admissions = count(r, (WARD_MEAN[w.kind] ?? 0) * busy);
    const discharges = count(
      r,
      (WARD_MEAN[w.kind] ?? 0) * (weekend ? 0.5 : 1.05),
    );
    const ageGroups = AGE_GROUPS.map(() => 0);
    for (let i = 0; i < admissions; i++)
      ageGroups[
        pickWeighted(r, AGE_WEIGHTS[w.kind] ?? AGE_WEIGHTS.general!)
      ]!++;
    const meanStay = w.kind === 'delivery' ? 2.5 : 5.5;
    let stayDays = 0;
    for (let i = 0; i < discharges; i++)
      stayDays += 1 + r() * (meanStay * 2 - 1);
    wards[w.code] = { admissions, discharges, stayDays, ageGroups };
  }

  // births: every delivery admission ends in a birth or two (twins now and then)
  const deliveries = wards.DEL?.admissions ?? 0;
  const births = { female: 0, male: 0 };
  for (let i = 0; i < deliveries; i++) {
    const babies = r() < 0.03 ? 2 : 1;
    for (let b = 0; b < babies; b++) births[r() < 0.49 ? 'female' : 'male']++;
  }
  // newborns are patients aged 0-1, admitted to the nursery
  if (wards.NUR) {
    wards.NUR.admissions = births.female + births.male;
    wards.NUR.ageGroups[0] = wards.NUR.admissions;
  }

  const dosesByDrug: Record<string, number> = {};
  let given = 0;
  for (const m of TOP_MEDS) {
    const c = count(r, m.mean * winter);
    dosesByDrug[m.name] = c;
    given += c;
  }
  const critical: Record<string, number> = {};
  // potassium and glucose are the usual critical ones; the rest are rare (often "<5" a day)
  LAB_TESTS.slice(0, 6).forEach((test, i) => {
    const c = count(r, i < 2 ? 6 : 0.6);
    if (c) critical[test.code] = c;
  });
  const diagnoses: Record<string, number> = {};
  ICD10.forEach((code, i) => {
    const c = count(r, (i < 4 ? 3 : 0.8) * winter);
    if (c) diagnoses[code.code] = c;
  });

  const facts: DayFacts = {
    day,
    wards,
    births,
    newPatients: count(r, weekend ? 3 : 9),
    doses: {
      given,
      skipped: count(r, given * 0.04),
      refused: count(r, given * 0.015),
    },
    dosesByDrug,
    critical,
    diagnoses,
    appointments: weekend
      ? { booked: 0, completed: 0, noShow: 0, cancelled: 0 }
      : {
          booked: count(r, 4),
          completed: count(r, 30),
          noShow: count(r, 2.5),
          cancelled: count(r, 3),
        },
  };
  cache.set(day, facts);
  return facts;
}

/** Every day "YYYY-MM-DD" from..to (both included) */
export function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (
    let t = Date.parse(`${from}T12:00:00Z`);
    t <= Date.parse(`${to}T12:00:00Z`);
    t += 86_400_000
  )
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
