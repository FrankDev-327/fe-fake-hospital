import { BEDS } from './data/admissions';
import type { FakeBed } from './data/admissions';
import {
  DELIVERIES,
  MATERNITY_ENCOUNTERS,
  MATERNITY_OBSERVATIONS,
} from './data/maternity';
import type { FakeDelivery, FakeGrant } from './data/maternity';
import { CONTACTS, DIAGNOSES, ENCOUNTERS, NOTES } from './data/charts';
import type {
  FakeContact,
  FakeDiagnosis,
  FakeEncounter,
  FakeNote,
} from './data/charts';
import { CRITICAL_ACKS, LAB_ORDERS, LAB_RESULTS } from './data/lab';
import type { FakeLabOrder, FakeLabResult } from './data/lab';
import { ADMINISTRATIONS, PRESCRIPTIONS } from './data/medication';
import type { FakeAdministration, FakePrescription } from './data/medication';
import {
  NURSE_DOCTORS,
  PATIENTS,
  patientIdsFor,
  RELATIONS,
} from './data/patients';
import type { FakePatient, FakeRelation } from './data/patients';
import { OBSERVATIONS } from './data/vitals';
import type { FakeObservation } from './data/vitals';

/**
 * The fake backend's "database": the records the app can CHANGE (register a patient, write a
 * note...). It starts as a copy of the seed data and is saved in localStorage, so changes
 * survive a page reload like a real backend. Fake data only.
 * "Reset demo data" on the login page (or mockDb.reset()) goes back to the seed.
 */
interface Db {
  patients: FakePatient[];
  contacts: FakeContact[];
  encounters: FakeEncounter[];
  notes: FakeNote[];
  diagnoses: FakeDiagnosis[];
  prescriptions: FakePrescription[];
  administrations: FakeAdministration[];
  observations: FakeObservation[];
  labOrders: FakeLabOrder[];
  labResults: FakeLabResult[];
  criticalAcks: typeof CRITICAL_ACKS;
  beds: FakeBed[];
  deliveries: FakeDelivery[];
  relations: FakeRelation[];
  grants: FakeGrant[];
}

const STORAGE_KEY = 'mock-api:db';
// bump when the shape of Db or the seed changes, so old saved data is dropped
const VERSION = 4;

const seed = (): Db =>
  structuredClone({
    patients: PATIENTS,
    contacts: CONTACTS,
    encounters: [...ENCOUNTERS, ...MATERNITY_ENCOUNTERS],
    notes: NOTES,
    diagnoses: DIAGNOSES,
    prescriptions: PRESCRIPTIONS,
    administrations: ADMINISTRATIONS,
    observations: [...OBSERVATIONS, ...MATERNITY_OBSERVATIONS],
    labOrders: LAB_ORDERS,
    labResults: LAB_RESULTS,
    criticalAcks: CRITICAL_ACKS,
    beds: BEDS,
    deliveries: DELIVERIES,
    relations: RELATIONS,
    grants: [],
  });

function load(): Db {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as {
      version: number;
      db: Db;
    } | null;
    if (saved?.version === VERSION) return saved.db;
  } catch {
    // broken JSON: start fresh
  }
  return seed();
}

let db: Db | null = null;

export const mockDb = {
  get(): Db {
    db ??= load();
    return db;
  },
  /** Call after every change. */
  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, db }));
  },
  reset() {
    db = seed();
    localStorage.removeItem(STORAGE_KEY);
  },
};

export const patientById = (id: string) =>
  mockDb.get().patients.find((p) => p.id === id);

/** UUIDv4 for new records (the real backend uses v7, the frontend doesn't care) */
export const newId = () => crypto.randomUUID();

export const nowIso = () => new Date().toISOString();

/**
 * Who a doctor/nurse may see: the fixed assignments + access made by births (the baby's
 * primary doctor, and the delivery team for 60 min). Nurses: their doctors' patients OR their
 * own rows (backend access_nurse_patient).
 */
export function accessiblePatientIds(staffId: string, role: string) {
  if (role !== 'doctor' && role !== 'nurse') return [];
  const now = Date.now();
  const live = mockDb
    .get()
    .grants.filter((g) => !g.endsAt || Date.parse(g.endsAt) > now);
  const myDoctors = role === 'nurse' ? (NURSE_DOCTORS[staffId] ?? []) : [];
  return [
    ...new Set([
      ...patientIdsFor(staffId, role),
      ...live
        .filter(
          (g) =>
            g.staffId === staffId ||
            (g.kind === 'primary' && myDoctors.includes(g.staffId)),
        )
        .map((g) => g.patientId),
    ]),
  ];
}
