import { DOCTOR_ID, NURSE_ID, OTHER_DOCTOR_ID } from './staff';
import { PATIENTS } from './patients';
import { daysFromNow, fakeId } from './ids';

/** GET /api/clinical/patients/:id/encounters */
export interface FakeEncounter {
  id: string;
  patientId: string;
  doctorId: string;
  departmentId: string | null;
  type: 'outpatient' | 'emergency' | 'inpatient';
  status: 'in_progress' | 'finished' | 'cancelled';
  reason: string | null;
  startedAt: string;
  endedAt: string | null;
  version: number;
}

/** GET /api/clinical/patients/:id/notes */
export interface FakeNote {
  id: string;
  patientId: string;
  encounterId: string;
  authorId: string;
  type: 'soap' | 'nursing' | 'procedure' | 'discharge';
  status: 'draft' | 'signed' | 'amended' | 'entered_in_error';
  body: string;
  amendsId: string | null;
  amendReason: string | null;
  errorReason: string | null;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** GET /api/clinical/patients/:id/diagnoses */
export interface FakeDiagnosis {
  id: string;
  patientId: string;
  encounterId: string;
  icd10Code: string;
  rank: 'primary' | 'secondary';
  status: 'provisional' | 'confirmed' | 'resolved' | 'entered_in_error';
  note: string | null;
  replacesId: string | null;
  diagnosedBy: string;
  diagnosedAt: string;
}

const pid = (n: number) => PATIENTS[n - 1]!.id;

/** The open visit of patient n has id fakeId(4500 + n): prescriptions point at it. */
export const openVisitId = (n: number) => fakeId(4500 + n);

const visit = (
  id: string,
  patient: number,
  type: FakeEncounter['type'],
  reason: string,
  startedDaysAgo: number,
  endedDaysAgo: number | null,
  doctorId = DOCTOR_ID,
): FakeEncounter => ({
  id,
  patientId: pid(patient),
  doctorId,
  departmentId: null,
  type,
  status: endedDaysAgo === null ? 'in_progress' : 'finished',
  reason,
  startedAt: daysFromNow(-startedDaysAgo, 14),
  endedAt: endedDaysAgo === null ? null : daysFromNow(-endedDaysAgo, 16),
  version: 1,
});

export const ENCOUNTERS: FakeEncounter[] = [
  visit(
    openVisitId(1),
    1,
    'inpatient',
    'Fever 39 °C and productive cough for 4 days',
    3,
    null,
  ),
  visit(fakeId(4601), 1, 'outpatient', 'Blood pressure check', 62, 62),
  visit(
    openVisitId(2),
    2,
    'inpatient',
    'High blood sugar, feeling weak',
    1,
    null,
  ),
  visit(fakeId(4602), 2, 'outpatient', 'Diabetes follow-up', 120, 120),
  visit(openVisitId(3), 3, 'inpatient', 'Right lower abdominal pain', 1, null),
  visit(
    openVisitId(4),
    4,
    'inpatient',
    'Shortness of breath, swollen legs',
    2,
    null,
  ),
  visit(openVisitId(5), 5, 'outpatient', 'Asthma, wheezing at night', 0, null),
  visit(openVisitId(6), 6, 'outpatient', 'Sore throat and fever', 0, null),
  visit(fakeId(4603), 7, 'inpatient', 'Chest pain', 5, null, OTHER_DOCTOR_ID),
];

let noteNo = 0;
const note = (
  encounterId: string,
  patient: number,
  type: FakeNote['type'],
  body: string,
  daysAgo: number,
  hour: number,
  authorId = DOCTOR_ID,
  status: FakeNote['status'] = 'signed',
): FakeNote => {
  const at = daysFromNow(-daysAgo, hour);
  return {
    id: fakeId(4700 + ++noteNo),
    patientId: pid(patient),
    encounterId,
    authorId,
    type,
    status,
    body,
    amendsId: null,
    amendReason: null,
    errorReason: null,
    signedAt: status === 'draft' ? null : at,
    createdAt: at,
    updatedAt: at,
    version: 1,
  };
};

export const NOTES: FakeNote[] = [
  note(
    openVisitId(1),
    1,
    'soap',
    'S: Fever up to 39 °C and cough with yellow sputum for 4 days. Short of breath on stairs.\nO: T 38.7 °C, RR 22, SpO2 93% on air. Crackles right lower lobe.\nA: Community-acquired pneumonia, right lower lobe.\nP: Admit. Ceftriaxone 1 g IV daily, enoxaparin, chest X-ray, CBC, CRP.',
    3,
    15,
  ),
  note(
    openVisitId(1),
    1,
    'nursing',
    'Patient settled in bed 101A. Oxygen 2 l/min by nasal cannula, SpO2 now 96%. Eating little.',
    3,
    18,
    NURSE_ID,
  ),
  note(
    openVisitId(1),
    1,
    'soap',
    'S: Feels a bit better, still coughing.\nO: T 37.9 °C, SpO2 95% on 1 l/min.\nA: Improving pneumonia.\nP: Continue antibiotics, try to stop oxygen tomorrow.',
    1,
    10,
  ),
  note(
    openVisitId(1),
    1,
    'soap',
    'S: \nO: \nA: \nP: ',
    0,
    9,
    DOCTOR_ID,
    'draft',
  ),
  note(
    fakeId(4601),
    1,
    'soap',
    'S: No complaints.\nO: BP 150/95 on two measurements.\nA: Essential hypertension.\nP: Start ramipril 5 mg, recheck in 3 months.',
    62,
    11,
  ),
  note(
    openVisitId(2),
    2,
    'soap',
    'S: Weak and thirsty for a week, poor diet control.\nO: Glucose 21 mmol/l, mild dehydration.\nA: Hyperglycaemia in type 2 diabetes.\nP: IV fluids, adjust metformin, diabetes nurse education.',
    1,
    15,
  ),
  note(
    openVisitId(4),
    4,
    'nursing',
    'Weight 72 kg. Legs swollen to the knees. Fluid balance chart started.',
    2,
    17,
    NURSE_ID,
  ),
];

let dxNo = 0;
const dx = (
  encounterId: string,
  patient: number,
  icd10Code: string,
  rank: FakeDiagnosis['rank'],
  status: FakeDiagnosis['status'],
  daysAgo: number,
  noteText: string | null = null,
): FakeDiagnosis => ({
  id: fakeId(4800 + ++dxNo),
  patientId: pid(patient),
  encounterId,
  icd10Code,
  rank,
  status,
  note: noteText,
  replacesId: null,
  diagnosedBy: DOCTOR_ID,
  diagnosedAt: daysFromNow(-daysAgo, 15),
});

export const DIAGNOSES: FakeDiagnosis[] = [
  dx(
    openVisitId(1),
    1,
    'J18.9',
    'primary',
    'confirmed',
    3,
    'Right lower lobe on X-ray',
  ),
  dx(fakeId(4601), 1, 'I10', 'primary', 'confirmed', 62),
  dx(openVisitId(2), 2, 'E11.9', 'primary', 'confirmed', 1),
  dx(openVisitId(2), 2, 'E86', 'secondary', 'provisional', 1),
  dx(
    openVisitId(3),
    3,
    'K35.8',
    'primary',
    'provisional',
    1,
    'Waiting for ultrasound',
  ),
  dx(openVisitId(4), 4, 'I50.0', 'primary', 'confirmed', 2),
];

/** GET /api/patients/patients/:id/contacts */
export interface FakeContact {
  id: string;
  patientId: string;
  relationship: string;
  name: string;
  phone: string;
}

export const CONTACTS: FakeContact[] = [
  {
    id: fakeId(2201),
    patientId: pid(1),
    relationship: 'Wife',
    name: 'Ana Matić',
    phone: '+385 98 222 1100',
  },
  {
    id: fakeId(2202),
    patientId: pid(1),
    relationship: 'Son',
    name: 'Ivan Matić',
    phone: '+385 91 333 4455',
  },
  {
    id: fakeId(2203),
    patientId: pid(4),
    relationship: 'Daughter',
    name: 'Maja Vuković',
    phone: '+385 95 765 4321',
  },
];
