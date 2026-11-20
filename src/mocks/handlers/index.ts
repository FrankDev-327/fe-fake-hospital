import { admissionsHandlers } from './admissions';
import { clinicalHandlers } from './clinical';
import { identityHandlers } from './identity';
import { medicationHandlers } from './medication';
import { patientsHandlers } from './patients';
import { reportingHandlers } from './reporting';

/** All fake backend endpoints, one file per backend service. */
export const handlers = [
  ...identityHandlers,
  ...patientsHandlers,
  ...clinicalHandlers,
  ...medicationHandlers,
  ...admissionsHandlers,
  ...reportingHandlers,
];
