import type { FakeEncounter } from './charts';
import { fakeId, hoursAgo } from './ids';
import {
  LUCIJA_ADMISSION,
  MARIJA_ADMISSION,
  BABY_HORVAT_ADMISSION,
} from './admissions';
import { PATIENTS } from './patients';
import { DOCTOR_ID, NURSE_ID } from './staff';
import type { FakeObservation } from './vitals';

/**
 * apps/admissions deliveries (slice 12 of the backend): a delivery is the "hub" that links the
 * mother, the babies and the team who helped. Fake data only.
 */
export interface FakeTeamMember {
  staffId: string;
  role: 'doctor' | 'nurse';
  addedAt: string;
}

export interface FakeBirth {
  babyPatientId: string;
  birthOrder: number;
  sex: 'female' | 'male' | 'unknown';
  bornAt: string;
  primaryDoctorId: string;
  babyAdmissionId: string;
  /**
   * Fake saga: the real backend makes the baby's record, access and visit in other services
   * (status "registering" -> "ready"). Here it's simply "ready" once this time has passed.
   */
  readyAt: string;
}

export interface FakeDelivery {
  id: string;
  motherPatientId: string;
  motherAdmissionId: string;
  status: 'in_labor' | 'delivered' | 'cancelled';
  startedBy: string;
  startedAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  team: FakeTeamMember[];
  births: FakeBirth[];
  version: number;
}

/** doctor_patient (kind primary/delivery) + nurse_patient rows made by births */
export interface FakeGrant {
  staffId: string;
  patientId: string;
  kind: 'primary' | 'delivery';
  /** null = until handed over; delivery team = 60 min after the birth */
  endsAt: string | null;
}

/** The delivery team sees the baby for this long (backend DELIVERY_ACCESS_MINUTES) */
export const DELIVERY_ACCESS_MINUTES = 60;

const IVANA_MARIC = fakeId(1008);
const lucija = PATIENTS[5]!;
const marija = PATIENTS[12]!;
const babyHorvat = PATIENTS[13]!;

export const DELIVERIES: FakeDelivery[] = [
  {
    id: fakeId(7001),
    motherPatientId: lucija.id,
    motherAdmissionId: LUCIJA_ADMISSION,
    status: 'in_labor',
    startedBy: NURSE_ID,
    startedAt: hoursAgo(2),
    deliveredAt: null,
    cancelledAt: null,
    cancelReason: null,
    team: [],
    births: [],
    version: 1,
  },
  {
    id: fakeId(7002),
    motherPatientId: marija.id,
    motherAdmissionId: MARIJA_ADMISSION,
    status: 'delivered',
    startedBy: NURSE_ID,
    startedAt: hoursAgo(26),
    deliveredAt: babyHorvat.bornAt!,
    cancelledAt: null,
    cancelReason: null,
    team: [
      { staffId: NURSE_ID, role: 'nurse', addedAt: babyHorvat.bornAt! },
      { staffId: DOCTOR_ID, role: 'doctor', addedAt: babyHorvat.bornAt! },
      { staffId: IVANA_MARIC, role: 'nurse', addedAt: babyHorvat.bornAt! },
    ],
    births: [
      {
        babyPatientId: babyHorvat.id,
        birthOrder: 1,
        sex: 'female',
        bornAt: babyHorvat.bornAt!,
        primaryDoctorId: DOCTOR_ID,
        babyAdmissionId: BABY_HORVAT_ADMISSION,
        readyAt: babyHorvat.bornAt!,
      },
    ],
    version: 2,
  },
];

/** The visit the birth saga opens for every baby */
export const newbornEncounter = (
  id: string,
  patientId: string,
  doctorId: string,
  startedAt: string,
): FakeEncounter => ({
  id,
  patientId,
  doctorId,
  departmentId: null,
  type: 'inpatient',
  status: 'in_progress',
  reason: 'Newborn',
  startedAt,
  endedAt: null,
  version: 1,
});

const BABY_VISIT = fakeId(4600);

export const MATERNITY_ENCOUNTERS: FakeEncounter[] = [
  newbornEncounter(BABY_VISIT, babyHorvat.id, DOCTOR_ID, babyHorvat.bornAt!),
];

/** Apgar scores of the seeded baby (1, 5 and 10 minutes after birth) */
export const MATERNITY_OBSERVATIONS: FakeObservation[] = (
  [
    ['apgar_1', 8, 1],
    ['apgar_5', 9, 5],
    ['apgar_10', 10, 10],
  ] as const
).map(([type, value, minutes], i) => ({
  id: fakeId(6900 + i),
  patientId: babyHorvat.id,
  encounterId: BABY_VISIT,
  type,
  value,
  value2: null,
  unit: '0-10',
  status: 'active',
  errorReason: null,
  recordedBy: NURSE_ID,
  recordedAt: new Date(
    Date.parse(babyHorvat.bornAt!) + minutes * 60_000,
  ).toISOString(),
}));
