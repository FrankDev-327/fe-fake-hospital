import { DOCTOR_ID, NURSE_ID } from './staff';
import { PATIENTS } from './patients';
import { fakeId } from './ids';

const pid = (n: number) => PATIENTS[n - 1]!.id;

/** GET /api/clinical/patients/:id/allergies */
export interface FakeAllergy {
  id: string;
  patientId: string;
  substance: string | null;
  atcCode: string | null;
  reaction: string | null;
  severity: 'mild' | 'moderate' | 'severe' | 'life_threatening';
  status: 'active' | 'inactive' | 'entered_in_error';
  recordedBy: string;
  recordedAt: string;
  updatedAt: string;
  version: number;
}

const allergy = (
  n: number,
  patient: number,
  substance: string,
  atcCode: string | null,
  reaction: string,
  severity: FakeAllergy['severity'],
): FakeAllergy => ({
  id: fakeId(4000 + n),
  patientId: pid(patient),
  substance,
  atcCode,
  reaction,
  severity,
  status: 'active',
  recordedBy: n % 2 ? DOCTOR_ID : NURSE_ID,
  recordedAt: '2026-10-02T10:15:00.000Z',
  updatedAt: '2026-10-02T10:15:00.000Z',
  version: 1,
});

export const ALLERGIES: FakeAllergy[] = [
  allergy(
    1,
    1,
    'Penicillin',
    'J01C', // the whole penicillin group: blocks amoxicillin (J01CA04)
    'Hives, swelling of the lips',
    'severe',
  ),
  allergy(2, 2, 'Ibuprofen', 'M01AE01', 'Stomach pain', 'mild'),
  allergy(
    3,
    4,
    'Codeine',
    'R05DA04',
    'Breathing difficulty',
    'life_threatening',
  ),
  allergy(4, 4, 'Latex', null, 'Skin rash', 'moderate'),
  allergy(5, 5, 'Peanuts', null, 'Anaphylaxis', 'life_threatening'),
  allergy(6, 9, 'Sulfonamides', 'J01E', 'Rash', 'moderate'),
];
