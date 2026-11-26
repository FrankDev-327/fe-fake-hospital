import { DOCTOR_ID, OTHER_DOCTOR_ID } from './staff';
import { PATIENTS } from './patients';
import { daysFromNow, fakeId, hoursAgo } from './ids';

/** GET /api/admissions/wards */
export interface FakeWard {
  id: string;
  code: string;
  name: string;
  /** delivery = labor rooms, maternity = mothers (+ rooming in), nursery/nicu = babies' cots */
  kind: 'general' | 'delivery' | 'maternity' | 'nursery' | 'nicu';
  isActive: boolean;
}

const ward = (n: number, code: string, name: string, kind: FakeWard['kind']) =>
  ({ id: fakeId(3000 + n), code, name, kind, isActive: true }) as FakeWard;

export const WARDS: FakeWard[] = [
  ward(1, 'INT', 'Internal medicine', 'general'),
  ward(2, 'SUR', 'Surgery', 'general'),
  ward(3, 'DEL', 'Delivery', 'delivery'),
  ward(4, 'MAT', 'Maternity', 'maternity'),
  ward(5, 'NUR', 'Nursery', 'nursery'),
];

/** Wards a newborn's cot may be in (same as the backend's NEWBORN_WARDS) */
export const NEWBORN_WARD_KINDS: FakeWard['kind'][] = [
  'maternity',
  'nursery',
  'nicu',
];

/** A bed and (maybe) who lies in it. The board only shows WHO to the patient's care team. */
export interface FakeBed {
  bedId: string;
  wardId: string;
  room: string;
  bed: string;
  active: boolean;
  stay: { admissionId: string; patientId: string; since: string } | null;
}

const stay = (n: number, patient: number, daysAgo: number) => ({
  admissionId: fakeId(3500 + n),
  patientId: PATIENTS[patient - 1]!.id,
  since: daysFromNow(-daysAgo, 14),
});

let bedNo = 0;
const bed = (
  wardId: string,
  room: string,
  bedCode: string,
  stayInfo: FakeBed['stay'] = null,
  active = true,
): FakeBed => ({
  bedId: fakeId(3100 + ++bedNo),
  wardId,
  room,
  bed: bedCode,
  active,
  stay: stayInfo,
});

const INT = WARDS[0]!.id;
const SUR = WARDS[1]!.id;
const DEL = WARDS[2]!.id;
const MAT = WARDS[3]!.id;
const NUR = WARDS[4]!.id;

/** A stay that started some hours ago (labor, a baby born yesterday) */
const stayH = (n: number, patient: number, hours: number) => ({
  admissionId: fakeId(3500 + n),
  patientId: PATIENTS[patient - 1]!.id,
  since: hoursAgo(hours),
});

export const BEDS: FakeBed[] = [
  bed(INT, '101', 'A', stay(1, 1, 3)),
  bed(INT, '101', 'B', stay(2, 2, 1)),
  bed(INT, '102', 'A', stay(3, 7, 5)), // another doctor's patient: hidden from Ana
  bed(INT, '102', 'B'),
  bed(INT, '103', 'A', stay(4, 4, 2)),
  bed(INT, '103', 'B', null, false), // out of service
  bed(INT, '104', 'A'),
  bed(INT, '104', 'B', stay(5, 10, 6)),
  bed(SUR, '201', 'A', stay(6, 3, 1)),
  bed(SUR, '201', 'B'),
  bed(SUR, '202', 'A', stay(7, 8, 4)),
  bed(SUR, '202', 'B'),
  bed(SUR, '203', 'A'),
  // births: Lucija (6) is in a labor room, Marija (13) on maternity, her baby (14) in the nursery
  bed(DEL, 'D1', 'A', stayH(8, 6, 3)),
  bed(DEL, 'D2', 'A'),
  bed(DEL, 'D3', 'A'),
  bed(MAT, '401', 'A', stayH(9, 13, 30)),
  bed(MAT, '401', 'B'), // rooming in: a cot next to the mother
  bed(MAT, '402', 'A'),
  bed(MAT, '402', 'B'),
  bed(NUR, 'N1', '1', stayH(10, 14, 20)),
  bed(NUR, 'N1', '2'),
  bed(NUR, 'N1', '3'),
  bed(NUR, 'N1', '4'),
];

/** The seeded mothers' admissions (deliveries point at them) */
export const LUCIJA_ADMISSION = fakeId(3508);
export const MARIJA_ADMISSION = fakeId(3509);
export const BABY_HORVAT_ADMISSION = fakeId(3510);

/** GET /api/admissions/doctors/:id/appointments?from&to */
export interface FakeAppointment {
  id: string;
  doctorId: string;
  patientId: string;
  startsAt: string;
  endsAt: string;
  visitType: 'first_visit' | 'follow_up' | 'procedure' | 'consultation';
  status: 'booked' | 'cancelled' | 'completed' | 'no_show';
}

let apptNo = 0;
const appt = (
  doctorId: string,
  patient: number,
  day: number,
  hour: number,
  minute: number,
  visitType: FakeAppointment['visitType'],
  status: FakeAppointment['status'] = 'booked',
): FakeAppointment => {
  const startsAt = daysFromNow(day, hour, minute);
  return {
    id: fakeId(3700 + ++apptNo),
    doctorId,
    patientId: PATIENTS[patient - 1]!.id,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 20 * 60_000).toISOString(),
    visitType,
    status,
  };
};

export const APPOINTMENTS: FakeAppointment[] = [
  appt(DOCTOR_ID, 5, 0, 8, 0, 'follow_up', 'completed'),
  appt(DOCTOR_ID, 6, 0, 8, 20, 'first_visit', 'no_show'),
  appt(DOCTOR_ID, 11, 0, 9, 0, 'first_visit'),
  appt(DOCTOR_ID, 12, 0, 10, 40, 'follow_up'),
  appt(DOCTOR_ID, 2, 0, 13, 0, 'consultation'),
  appt(DOCTOR_ID, 9, 1, 8, 40, 'procedure'),
  appt(DOCTOR_ID, 5, 1, 11, 0, 'follow_up', 'cancelled'),
  appt(DOCTOR_ID, 6, 2, 9, 20, 'follow_up'),
  appt(DOCTOR_ID, 3, 3, 12, 0, 'consultation'),
  appt(OTHER_DOCTOR_ID, 8, 0, 9, 0, 'follow_up'),
  appt(OTHER_DOCTOR_ID, 7, 1, 10, 0, 'procedure'),
];
