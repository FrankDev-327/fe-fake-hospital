import { DOCTOR_ID, NURSE_ID, OTHER_DOCTOR_ID } from './staff';
import { fakeId, hoursAgo } from './ids';

/** GET /api/patients/patients/:id (full record, decrypted by the backend) */
export interface FakePatient {
  id: string;
  mrn: string;
  /** null = a newborn whose parents haven't chosen a name yet */
  firstName: string | null;
  lastName: string;
  dateOfBirth: string;
  /** exact time of birth, only for babies born in this hospital */
  bornAt?: string | null;
  sex: 'female' | 'male' | 'other' | 'unknown';
  oib: string | null;
  mbo: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  bloodType: string | null;
  deceasedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Croatian OIB check digit (ISO 7064 MOD 11,10), same as the backend's isValidOib. */
export function withOibCheckDigit(first10: string) {
  let a = 10;
  for (const ch of first10) {
    a = (a + Number(ch)) % 10;
    if (a === 0) a = 10;
    a = (a * 2) % 11;
  }
  return first10 + ((11 - a) % 10);
}

const p = (
  n: number,
  firstName: string | null,
  lastName: string,
  dateOfBirth: string,
  sex: FakePatient['sex'],
  extra: Partial<FakePatient> = {},
): FakePatient => ({
  id: fakeId(2000 + n),
  mrn: `MRN-${String(240000 + n * 137)}`,
  firstName,
  lastName,
  dateOfBirth,
  sex,
  oib: withOibCheckDigit(String(1000000000 + n * 79190913).slice(0, 10)),
  mbo: String(100000000 + n * 1234567).slice(0, 9),
  email:
    `${firstName ?? 'baby'}.${lastName}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^\w.]/g, '') + '@mail.test',
  phone: `+385 91 ${String(1000000 + n * 48271).slice(0, 3)} ${String(n * 7331)
    .padStart(4, '0')
    .slice(0, 4)}`,
  address: `Ilica ${n * 3}, 10000 Zagreb`,
  bloodType: ['A+', '0+', 'B+', 'AB+', 'A-', '0-'][n % 6]!,
  deceasedAt: null,
  version: 1,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-11-10T08:00:00.000Z',
  ...extra,
});

const BABY_BORN_AT = hoursAgo(20);

/** Seed data. The live (changeable) copy is in mocks/db.ts. */
export const PATIENTS: FakePatient[] = [
  p(1, 'Josip', 'Matić', '1948-03-12', 'male'),
  p(2, 'Mira', 'Petrović', '1956-07-30', 'female'),
  p(3, 'Stjepan', 'Knežević', '1971-11-02', 'male'),
  p(4, 'Kata', 'Vuković', '1939-01-19', 'female', { bloodType: '0-' }),
  p(5, 'Nikola', 'Tomić', '1989-05-25', 'male'),
  p(6, 'Lucija', 'Pavlović', '2001-09-14', 'female'),
  p(7, 'Branko', 'Kovačević', '1963-04-08', 'male'),
  p(8, 'Sanja', 'Blažević', '1977-12-21', 'female'),
  p(9, 'Dario', 'Grgić', '1995-02-03', 'male'),
  p(10, 'Ružica', 'Pavić', '1952-06-17', 'female'),
  p(11, 'Filip', 'Božić', '2010-10-10', 'male', { email: null }),
  p(12, 'Ana', 'Matić', '1950-08-28', 'female', { phone: null }),
  p(13, 'Marija', 'Horvat', '1994-04-02', 'female'),
  // Marija's baby, born yesterday: no name yet, no OIB/MBO (those come later from the registry)
  p(14, null, 'Horvat', BABY_BORN_AT.slice(0, 10), 'female', {
    bornAt: BABY_BORN_AT,
    oib: null,
    mbo: null,
    email: null,
    phone: null,
    address: null,
    bloodType: null,
  }),
];

/** doctor_patient: who is whose doctor right now */
export const DOCTOR_PATIENTS: Record<string, string[]> = {
  [DOCTOR_ID]: [...PATIENTS.slice(0, 6), ...PATIENTS.slice(12, 14)].map(
    (x) => x.id,
  ),
  [OTHER_DOCTOR_ID]: PATIENTS.slice(6, 9).map((x) => x.id),
};

/** doctor_nurse: which doctors a nurse works for */
export const NURSE_DOCTORS: Record<string, string[]> = {
  [NURSE_ID]: [DOCTOR_ID],
};

/** The access rule from the backend: doctors their own patients, nurses their doctors' patients. */
export function patientIdsFor(staffId: string, role: string): string[] {
  if (role === 'doctor') return DOCTOR_PATIENTS[staffId] ?? [];
  if (role === 'nurse')
    return (NURSE_DOCTORS[staffId] ?? []).flatMap(
      (d) => DOCTOR_PATIENTS[d] ?? [],
    );
  return [];
}

export const toSummary = (x: FakePatient) => ({
  id: x.id,
  mrn: x.mrn,
  firstName: x.firstName,
  lastName: x.lastName,
  sex: x.sex,
  dateOfBirth: x.dateOfBirth,
});

/** patient_relations: child -> mother */
export interface FakeRelation {
  childId: string;
  motherId: string;
}

export const RELATIONS: FakeRelation[] = [
  { childId: PATIENTS[13]!.id, motherId: PATIENTS[12]!.id },
];
