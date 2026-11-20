import { DOCTOR_ID, NURSE_ID } from './staff';
import { PATIENTS } from './patients';
import { daysFromNow, fakeId, hoursAgo } from './ids';

/** GET /api/medication/medications?q= (drug catalog) */
export interface FakeMedication {
  id: string;
  name: string;
  activeIngredient: string;
  atcCode: string;
  form: string;
  strength: string;
}

const med = (
  n: number,
  name: string,
  activeIngredient: string,
  atcCode: string,
  form: string,
  strength: string,
): FakeMedication => ({
  id: fakeId(5000 + n),
  name,
  activeIngredient,
  atcCode,
  form,
  strength,
});

export const MEDICATIONS: FakeMedication[] = [
  med(1, 'Amoxicillin', 'amoxicillin', 'J01CA04', 'capsule', '500 mg'),
  med(2, 'Ceftriaxone', 'ceftriaxone', 'J01DD04', 'injection', '1 g'),
  med(3, 'Paracetamol', 'paracetamol', 'N02BE01', 'tablet', '500 mg'),
  med(4, 'Ibuprofen', 'ibuprofen', 'M01AE01', 'tablet', '400 mg'),
  med(5, 'Metformin', 'metformin', 'A10BA02', 'tablet', '850 mg'),
  med(6, 'Enoxaparin', 'enoxaparin', 'B01AB05', 'injection', '40 mg'),
  med(7, 'Pantoprazole', 'pantoprazole', 'A02BC02', 'tablet', '40 mg'),
  med(8, 'Furosemide', 'furosemide', 'C03CA01', 'tablet', '40 mg'),
  med(9, 'Ramipril', 'ramipril', 'C09AA05', 'tablet', '5 mg'),
  med(10, 'Atorvastatin', 'atorvastatin', 'C10AA05', 'tablet', '20 mg'),
  med(11, 'Morphine', 'morphine', 'N02AA01', 'injection', '10 mg'),
  med(
    12,
    'Insulin glargine',
    'insulin glargine',
    'A10AE04',
    'injection',
    '100 U/ml',
  ),
  med(13, 'Bisoprolol', 'bisoprolol', 'C07AB07', 'tablet', '5 mg'),
  med(14, 'Warfarin', 'warfarin', 'B01AA03', 'tablet', '5 mg'),
  med(15, 'Salbutamol', 'salbutamol', 'R03AC02', 'inhaler', '100 mcg'),
];

/** Stored prescription (the view adds the drug and lastGivenAt) */
export interface FakePrescription {
  id: string;
  patientId: string;
  encounterId: string;
  medicationId: string;
  prescribedBy: string;
  /** numeric comes back from Postgres as a string: "1.000" */
  doseAmount: string;
  doseUnit: string;
  route: string;
  intervalHours: number | null;
  asNeeded: boolean;
  instructions: string | null;
  startsAt: string;
  endsAt: string | null;
  status: 'active' | 'stopped' | 'completed' | 'entered_in_error';
  overrideReason: string | null;
  stoppedBy: string | null;
  stoppedAt: string | null;
  stopReason: string | null;
}

/** One dose given / skipped / refused (append-only, the digital MAR) */
export interface FakeAdministration {
  id: string;
  prescriptionId: string;
  patientId: string;
  administeredBy: string;
  status: 'given' | 'skipped' | 'refused';
  doseAmount: string | null;
  doseUnit: string | null;
  scheduledFor: string | null;
  administeredAt: string;
  note: string | null;
  idempotencyKey: string;
  createdAt: string;
}

export const PRESCRIPTIONS: FakePrescription[] = [];
export const ADMINISTRATIONS: FakeAdministration[] = [];

const rx = (
  n: number,
  patient: number,
  medNo: number,
  dose: [number, string, string],
  intervalHours: number | null,
  lastGivenHoursAgo: number | null,
  instructions: string | null = null,
) => {
  const id = fakeId(5100 + n);
  const patientId = PATIENTS[patient - 1]!.id;
  PRESCRIPTIONS.push({
    id,
    patientId,
    encounterId: fakeId(4500 + patient),
    medicationId: MEDICATIONS[medNo - 1]!.id,
    prescribedBy: DOCTOR_ID,
    doseAmount: dose[0].toFixed(3),
    doseUnit: dose[1],
    route: dose[2],
    intervalHours,
    asNeeded: intervalHours === null,
    instructions,
    startsAt: daysFromNow(-3, 8),
    endsAt: null,
    status: 'active',
    overrideReason: null,
    stoppedBy: null,
    stoppedAt: null,
    stopReason: null,
  });
  if (lastGivenHoursAgo !== null) {
    const at = hoursAgo(lastGivenHoursAgo);
    ADMINISTRATIONS.push({
      id: fakeId(5300 + n),
      prescriptionId: id,
      patientId,
      administeredBy: NURSE_ID,
      status: 'given',
      doseAmount: dose[0].toFixed(3),
      doseUnit: dose[1],
      scheduledFor: null,
      administeredAt: at,
      note: null,
      idempotencyKey: fakeId(5500 + n),
      createdAt: at,
    });
  }
};

rx(1, 1, 2, [1, 'g', 'iv'], 24, 20, 'Diluted in 100 ml saline over 30 min');
rx(2, 1, 6, [40, 'mg', 'sc'], 24, 23);
rx(3, 1, 3, [1000, 'mg', 'oral'], null, 5, 'If temperature > 38.5 °C');
rx(4, 2, 5, [850, 'mg', 'oral'], 12, 13, 'With meals');
rx(5, 2, 9, [5, 'mg', 'oral'], 24, 2);
rx(6, 3, 7, [40, 'mg', 'oral'], 24, 1);
rx(7, 4, 8, [40, 'mg', 'oral'], 12, 11);
rx(8, 4, 13, [5, 'mg', 'oral'], 24, 30);
rx(9, 5, 15, [2, 'puff', 'inhaled'], null, null, 'When short of breath');
rx(10, 6, 1, [500, 'mg', 'oral'], 8, 9);
