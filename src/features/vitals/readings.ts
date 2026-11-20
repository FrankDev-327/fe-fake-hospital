import { VITAL_ORDER, VITALS } from './api';
import type { Reading, VitalType } from './api';

/** Fields of the form: every vital sign, plus the diastolic for BP */
export type Values = Partial<Record<VitalType | 'bp2', string>>;

/** Turns the filled fields into readings; returns the field errors too. Empty fields are skipped. */
export function toReadings(v: Values): { readings: Reading[]; errors: Values } {
  const readings: Reading[] = [];
  const errors: Values = {};
  for (const type of VITAL_ORDER) {
    const raw = v[type]?.trim();
    const raw2 = type === 'bp' ? v.bp2?.trim() : undefined;
    if (!raw && !raw2) continue;
    const { min, max } = VITALS[type];
    const value = Number(raw?.replace(',', '.'));
    if (!raw || Number.isNaN(value) || value < min || value > max) {
      errors[type] = `${min} to ${max}`;
      continue;
    }
    if (type === 'pain' && !Number.isInteger(value)) {
      errors.pain = 'Whole number 0 to 10';
      continue;
    }
    if (type === 'bp') {
      const value2 = Number(raw2?.replace(',', '.'));
      if (
        !raw2 ||
        Number.isNaN(value2) ||
        value2 < 20 ||
        value2 > 200 ||
        value2 >= value
      ) {
        errors.bp2 = 'Lower than systolic (20 to 200)';
        continue;
      }
      readings.push({ type, value, value2 });
    } else readings.push({ type, value });
  }
  return { readings, errors };
}
