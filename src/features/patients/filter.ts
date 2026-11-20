import type { PatientSummary } from './api';

/** "Matić" -> "matic": lower case, no accents, so typing without č/ć still finds the patient */
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** Every word typed must match the name or the MRN ("jos mat" finds Matić, Josip). */
export function matchesPatient(p: PatientSummary, filter: string) {
  const haystack = normalize(`${p.firstName} ${p.lastName} ${p.mrn}`);
  return normalize(filter)
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}
