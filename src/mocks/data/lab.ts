import { DOCTOR_ID, OTHER_DOCTOR_ID } from './staff';
import { openVisitId } from './charts';
import { PATIENTS } from './patients';
import { fakeId, hoursAgo } from './ids';

/** The backend's lab_tests catalog (apps/clinical migration CreateLab): LOINC code, ranges. */
export interface FakeLabTest {
  code: string;
  name: string;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  criticalLow: number | null;
  criticalHigh: number | null;
}

const t = (
  code: string,
  name: string,
  unit: string,
  refLow: number | null,
  refHigh: number | null,
  criticalLow: number | null,
  criticalHigh: number | null,
): FakeLabTest => ({
  code,
  name,
  unit,
  refLow,
  refHigh,
  criticalLow,
  criticalHigh,
});

export const LAB_TESTS: FakeLabTest[] = [
  t('718-7', 'Hemoglobin', 'g/L', 120, 160, 70, 200),
  t('6690-2', 'Leukocytes', '10^9/L', 4, 10, 2, 30),
  t('777-3', 'Platelets', '10^9/L', 150, 400, 20, 1000),
  t('2951-2', 'Sodium', 'mmol/L', 135, 145, 120, 160),
  t('2823-3', 'Potassium', 'mmol/L', 3.5, 5.1, 2.5, 6.5),
  t('2160-0', 'Creatinine', 'umol/L', 60, 110, null, null),
  t('3094-0', 'Urea', 'mmol/L', 2.5, 7.5, null, null),
  t('2345-7', 'Glucose', 'mmol/L', 3.9, 6.1, 2.5, 25),
  t('1988-5', 'C-reactive protein', 'mg/L', 0, 5, null, null),
  t('6301-6', 'INR', 'ratio', 0.8, 1.2, null, 5),
  t('1742-6', 'ALT', 'U/L', 0, 41, null, null),
  t('4548-4', 'HbA1c', '%', 4, 6, null, null),
  t('2524-7', 'Lactate', 'mmol/L', 0.5, 2.2, null, 4),
  t('10839-9', 'Troponin I', 'ng/L', 0, 26, null, null),
];

export type LabFlag =
  'normal' | 'low' | 'high' | 'critical_low' | 'critical_high';

/** Same as apps/clinical/src/lab/lab-flags.ts */
export function flagFor(test: FakeLabTest, value: number): LabFlag {
  if (test.criticalLow !== null && value < test.criticalLow)
    return 'critical_low';
  if (test.criticalHigh !== null && value > test.criticalHigh)
    return 'critical_high';
  if (test.refLow !== null && value < test.refLow) return 'low';
  if (test.refHigh !== null && value > test.refHigh) return 'high';
  return 'normal';
}

export const isCritical = (flag: LabFlag | null) =>
  flag === 'critical_low' || flag === 'critical_high';

export interface FakeLabOrder {
  id: string;
  patientId: string;
  encounterId: string;
  orderedBy: string;
  priority: 'routine' | 'urgent';
  status: 'ordered' | 'collected' | 'resulted' | 'cancelled';
  orderedAt: string;
  collectedAt: string | null;
  tests: string[];
}

export interface FakeLabResult {
  id: string;
  labOrderId: string;
  patientId: string;
  testCode: string;
  value: number | null;
  valueText: string | null;
  unit: string;
  flag: LabFlag | null;
  correctsId: string | null;
  correctionReason: string | null;
  resultedBy: string;
  resultedAt: string;
}

const LAB_TECH = fakeId(1003);
const pid = (n: number) => PATIENTS[n - 1]!.id;

let orderNo = 0;
const order = (
  patient: number,
  encounterId: string,
  priority: FakeLabOrder['priority'],
  status: FakeLabOrder['status'],
  orderedHoursAgo: number,
  tests: string[],
  orderedBy = DOCTOR_ID,
): FakeLabOrder => ({
  id: fakeId(4100 + ++orderNo),
  patientId: pid(patient),
  encounterId,
  orderedBy,
  priority,
  status,
  orderedAt: hoursAgo(orderedHoursAgo),
  collectedAt: status === 'ordered' ? null : hoursAgo(orderedHoursAgo - 0.5),
  tests,
});

export const LAB_ORDERS: FakeLabOrder[] = [
  // Josip, admission bloods (resulted) + an urgent recheck waiting for collection
  order(1, openVisitId(1), 'routine', 'resulted', 70, [
    '718-7',
    '6690-2',
    '1988-5',
    '2823-3',
  ]),
  order(1, openVisitId(1), 'urgent', 'ordered', 0.4, ['2823-3', '2160-0']),
  // Mira: glucose came back critical and nobody acknowledged it yet
  order(2, openVisitId(2), 'urgent', 'resulted', 20, [
    '2345-7',
    '2823-3',
    '2951-2',
  ]),
  // Stjepan: appendicitis work-up, not collected yet
  order(3, openVisitId(3), 'routine', 'ordered', 2, ['6690-2', '1988-5']),
  // Kata: INR collected, waiting for the lab
  order(4, openVisitId(4), 'urgent', 'collected', 1.5, ['6301-6']),
  // Branko (Dr. Šimić's patient)
  order(7, fakeId(4603), 'routine', 'ordered', 3, ['10839-9'], OTHER_DOCTOR_ID),
];

let resultNo = 0;
const result = (
  orderIndex: number,
  testCode: string,
  value: number,
  resultedHoursAgo: number,
): FakeLabResult => {
  const o = LAB_ORDERS[orderIndex]!;
  const test = LAB_TESTS.find((x) => x.code === testCode)!;
  return {
    id: fakeId(4200 + ++resultNo),
    labOrderId: o.id,
    patientId: o.patientId,
    testCode,
    value,
    valueText: null,
    unit: test.unit,
    flag: flagFor(test, value),
    correctsId: null,
    correctionReason: null,
    resultedBy: LAB_TECH,
    resultedAt: hoursAgo(resultedHoursAgo),
  };
};

export const LAB_RESULTS: FakeLabResult[] = [
  result(0, '718-7', 128, 68),
  result(0, '6690-2', 15.8, 68), // high
  result(0, '1988-5', 148, 68), // high
  result(0, '2823-3', 4.1, 68),
  result(2, '2345-7', 27.4, 19), // critical high
  result(2, '2823-3', 5.4, 19), // high
  result(2, '2951-2', 133, 19), // low
];

/** labResultId -> who acknowledged (critical results only) */
export const CRITICAL_ACKS: {
  labResultId: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
}[] = [];
