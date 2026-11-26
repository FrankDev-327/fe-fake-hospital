import type { FakeBed } from './data/admissions';
import type { FakeEncounter } from './data/charts';
import { fakeId, hoursAgo } from './data/ids';
import type { FakeObservation } from './data/vitals';
import { DOCTOR_ID, NURSE_ID, OTHER_DOCTOR_ID } from './data/staff';
import { DOCTOR_PATIENTS } from './data/patients';

/** A hospital stay (apps/admissions Admission + its discharge saga steps) */
export interface FakeAdmission {
  id: string;
  patientId: string;
  encounterId: string;
  status: 'active' | 'discharging' | 'discharged';
  /** current bed; null after discharge */
  bedId: string | null;
  admittedBy: string;
  admittedAt: string;
  discharge: {
    requestedBy: string;
    requestedAt: string;
    failure: string | null;
    steps: DischargeStep[];
  } | null;
  dischargedAt: string | null;
  version: number;
}

export interface DischargeStep {
  step: 'close_encounter' | 'stop_medication';
  status: 'waiting' | 'pending' | 'done' | 'failed' | 'timed_out';
  detail: string | null;
}

interface StoreShape {
  beds: FakeBed[];
  encounters: FakeEncounter[];
  admissions: FakeAdmission[];
}

const REASONS = [
  'Chest pain, rule out heart attack',
  'Heart failure, short of breath',
  'Stroke symptoms, weak right arm',
  'Pneumonia, low oxygen',
  'After hip surgery',
  'Atrial fibrillation, fast pulse',
  'Seizure, first time',
  'Kidney infection, high fever',
  'After gallbladder surgery',
  'Diabetes out of control',
];

const doctorOf = (patientId: string) =>
  Object.entries(DOCTOR_PATIENTS).find(([, ids]) =>
    ids.includes(patientId),
  )?.[0] ?? DOCTOR_ID;

/**
 * Every patient lying in a bed has an admission record and an open hospital visit.
 * The seed only says "who lies where" (beds); this fills in the rest. The births saga also puts
 * babies into cots, so the handlers run this too before reading admissions.
 */
export function ensureAdmissions(
  db: StoreShape,
  makeId: (kind: 'enc' | 'adm', n: number) => string,
) {
  db.beds.forEach((bed, i) => {
    const stay = bed.stay;
    if (!stay || db.admissions.some((a) => a.id === stay.admissionId)) return;
    let visit = db.encounters.find(
      (e) => e.patientId === stay.patientId && e.status === 'in_progress',
    );
    if (!visit) {
      visit = {
        id: makeId('enc', i),
        patientId: stay.patientId,
        doctorId: doctorOf(stay.patientId),
        departmentId: null,
        type: 'inpatient',
        status: 'in_progress',
        reason: REASONS[i % REASONS.length]!,
        startedAt: stay.since,
        endedAt: null,
        version: 1,
      };
      db.encounters.push(visit);
    }
    db.admissions.push({
      id: stay.admissionId,
      patientId: stay.patientId,
      encounterId: visit.id,
      status: 'active',
      bedId: bed.bedId,
      admittedBy: visit.doctorId,
      admittedAt: stay.since,
      discharge: null,
      dischargedAt: null,
      version: 1,
    });
  });
}

/** Seed: admissions for the beds, visits for the waiting patients, vitals, one stuck discharge */
export function seedAdmissions(
  db: StoreShape & { observations: FakeObservation[] },
  waiting: string[],
  stuckPatientId: string,
) {
  const before = new Set(db.encounters.map((e) => e.id));
  ensureAdmissions(db, (kind, n) => fakeId((kind === 'enc' ? 4700 : 4900) + n));

  // patients sent to the hospital who wait for a bed: open inpatient visit, no admission
  waiting.forEach((patientId, i) =>
    db.encounters.push({
      id: fakeId(4690 + i),
      patientId,
      doctorId: doctorOf(patientId),
      departmentId: null,
      type: 'inpatient',
      status: 'in_progress',
      reason: REASONS[(i + 3) % REASONS.length]!,
      startedAt: hoursAgo(1 + i),
      endedAt: null,
      version: 1,
    }),
  );

  // a few bedside rounds for every new visit, so their charts aren't empty
  let n = 0;
  for (const visit of db.encounters.filter((e) => !before.has(e.id))) {
    const seedNo = n;
    for (const [h, drift] of [
      [30, 0.6],
      [18, 0.3],
      [6, 0],
    ] as const) {
      const at = hoursAgo(h);
      if (at < visit.startedAt) continue;
      const add = (
        type: FakeObservation['type'],
        unit: string,
        value: number,
        value2: number | null = null,
      ) =>
        db.observations.push({
          id: fakeId(7000 + n++),
          patientId: visit.patientId,
          encounterId: visit.id,
          type,
          value,
          value2,
          unit,
          status: 'active',
          errorReason: null,
          recordedBy: NURSE_ID,
          recordedAt: at,
        });
      const v = seedNo % 7;
      add('temperature', '°C', Math.round((36.6 + drift + v * 0.1) * 10) / 10);
      add('pulse', '/min', 70 + v * 4 + Math.round(drift * 20));
      add('bp', 'mmHg', 120 + v * 5 + Math.round(drift * 15), 75 + v * 2);
      add('spo2', '%', 98 - Math.round(drift * 4) - (v % 3));
    }
  }

  // a discharge that got stuck: clinical didn't answer in time -> Retry or Abort
  const stuck = db.admissions.find((a) => a.patientId === stuckPatientId);
  if (stuck) {
    stuck.status = 'discharging';
    stuck.discharge = {
      requestedBy: doctorOf(stuckPatientId) ?? OTHER_DOCTOR_ID,
      requestedAt: hoursAgo(1),
      failure: 'close_encounter timed out (clinical did not answer in 5 min)',
      steps: [
        { step: 'close_encounter', status: 'timed_out', detail: null },
        { step: 'stop_medication', status: 'waiting', detail: null },
      ],
    };
    stuck.version = 2;
  }
}

/** GET admission view (apps/admissions admissions.service.ts view()) */
export function admissionView(
  a: FakeAdmission,
  beds: FakeBed[],
  wardOf: (wardId: string) => { id: string; code: string; name: string },
) {
  const bed = a.bedId ? beds.find((b) => b.bedId === a.bedId) : undefined;
  const { bedId: _bedId, ...rest } = a;
  return {
    ...rest,
    bed: bed
      ? {
          bedId: bed.bedId,
          ward: wardOf(bed.wardId),
          room: bed.room,
          bed: bed.bed,
        }
      : null,
  };
}
