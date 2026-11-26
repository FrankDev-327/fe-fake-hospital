import { DOCTOR_ID, NURSE_ID } from './staff';
import { openVisitId } from './charts';
import { PATIENTS } from './patients';
import { fakeId, hoursAgo } from './ids';

export type ObservationType =
  | 'bp'
  | 'pulse'
  | 'resp_rate'
  | 'temperature'
  | 'spo2'
  | 'weight'
  | 'height'
  | 'pain'
  | 'glucose'
  | 'apgar_1'
  | 'apgar_5'
  | 'apgar_10';

/** Fixed unit per vital sign (never typed by hand) */
export const OBSERVATION_UNITS: Record<ObservationType, string> = {
  bp: 'mmHg',
  pulse: '/min',
  resp_rate: '/min',
  temperature: '°C',
  spo2: '%',
  weight: 'kg',
  height: 'cm',
  pain: '0-10',
  glucose: 'mmol/L',
  apgar_1: '0-10',
  apgar_5: '0-10',
  apgar_10: '0-10',
};

/** Plausible ranges (typo catcher, not "normal" ranges): apps/clinical vitals.service.ts */
export const RANGES: Record<ObservationType, [number, number]> = {
  bp: [40, 300],
  pulse: [20, 300],
  resp_rate: [4, 80],
  temperature: [25, 45],
  spo2: [50, 100],
  weight: [0.3, 500],
  height: [20, 250],
  pain: [0, 10],
  glucose: [0.5, 50],
  apgar_1: [0, 10],
  apgar_5: [0, 10],
  apgar_10: [0, 10],
};

export interface FakeObservation {
  id: string;
  patientId: string;
  encounterId: string;
  type: ObservationType;
  value: number;
  value2: number | null;
  unit: string;
  status: 'active' | 'entered_in_error';
  errorReason: string | null;
  recordedBy: string;
  recordedAt: string;
}

export const OBSERVATIONS: FakeObservation[] = [];
let n = 0;

/** One bedside round: several readings at the same time */
function round(
  patient: number,
  hoursBack: number,
  readings: [ObservationType, number, number?][],
  by = NURSE_ID,
) {
  const at = hoursAgo(hoursBack);
  for (const [type, value, value2] of readings)
    OBSERVATIONS.push({
      id: fakeId(6000 + ++n),
      patientId: PATIENTS[patient - 1]!.id,
      encounterId: openVisitId(patient),
      type,
      value,
      value2: value2 ?? null,
      unit: OBSERVATION_UNITS[type],
      status: 'active',
      errorReason: null,
      recordedBy: by,
      recordedAt: at,
    });
}

// Josip: pneumonia getting better over 3 days (fever down, oxygen up)
const josip: [number, number, number, number, number, number][] = [
  // hoursAgo, temp, pulse, spo2, sys, dia
  [72, 38.7, 112, 93, 138, 84],
  [64, 38.9, 108, 92, 135, 82],
  [56, 38.4, 104, 94, 132, 80],
  [48, 38.1, 100, 94, 130, 80],
  [40, 37.9, 96, 95, 128, 78],
  [32, 38.0, 94, 95, 130, 79],
  [24, 37.6, 90, 96, 126, 76],
  [16, 37.4, 86, 96, 124, 76],
  [8, 37.2, 84, 97, 122, 75],
];
for (const [h, temp, pulse, spo2, sys, dia] of josip)
  round(1, h, [
    ['temperature', temp],
    ['pulse', pulse],
    ['spo2', spo2],
    ['bp', sys, dia],
    ['resp_rate', Math.round(pulse / 5)],
  ]);
round(
  1,
  70,
  [
    ['weight', 81.5],
    ['height', 178],
  ],
  DOCTOR_ID,
);

// Mira: sugar coming down with fluids
for (const [h, glucose, sys, dia] of [
  [22, 21.3, 150, 92],
  [14, 16.8, 146, 90],
  [6, 11.2, 140, 88],
])
  round(2, h!, [
    ['glucose', glucose!],
    ['bp', sys!, dia!],
    ['pulse', 92],
  ]);

// Kata: heart failure, weight is what matters
for (const [h, kg] of [
  [46, 72],
  [22, 71.2],
  [4, 70.5],
])
  round(4, h!, [
    ['weight', kg!],
    ['spo2', 92],
    ['bp', 118, 70],
  ]);
