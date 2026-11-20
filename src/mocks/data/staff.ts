import type { Staff } from '@/auth/types';
import { fakeId } from './ids';

/** Every demo account uses this password. Fake data only. */
export const DEMO_PASSWORD = 'demo-password';

const base = {
  departmentId: null,
  licenseNumber: null,
  isActive: true,
  lastLoginAt: null,
};

export const DOCTOR_ID = fakeId(1001);
export const NURSE_ID = fakeId(1002);
export const OTHER_DOCTOR_ID = fakeId(1007);

/** One demo user per role (shown on the login page), plus colleagues so lists aren't empty. */
export const STAFF: Staff[] = [
  {
    ...base,
    id: DOCTOR_ID,
    role: 'doctor',
    firstName: 'Ana',
    lastName: 'Kovač',
    email: 'ana.kovac@hospital.test',
    licenseNumber: 'HR-MD-10421',
  },
  {
    ...base,
    id: NURSE_ID,
    role: 'nurse',
    firstName: 'Ivan',
    lastName: 'Horvat',
    email: 'ivan.horvat@hospital.test',
  },
  {
    ...base,
    id: fakeId(1003),
    role: 'lab_tech',
    firstName: 'Marija',
    lastName: 'Babić',
    email: 'marija.babic@hospital.test',
  },
  {
    ...base,
    id: fakeId(1004),
    role: 'pharmacist',
    firstName: 'Petra',
    lastName: 'Novak',
    email: 'petra.novak@hospital.test',
  },
  {
    ...base,
    id: fakeId(1005),
    role: 'receptionist',
    firstName: 'Luka',
    lastName: 'Jurić',
    email: 'luka.juric@hospital.test',
  },
  {
    ...base,
    id: fakeId(1006),
    role: 'admin',
    firstName: 'Tomislav',
    lastName: 'Perić',
    email: 'tomislav.peric@hospital.test',
  },
  // ---- colleagues (can't log in from the demo box, but appear in lists) ----
  {
    ...base,
    id: OTHER_DOCTOR_ID,
    role: 'doctor',
    firstName: 'Marko',
    lastName: 'Šimić',
    email: 'marko.simic@hospital.test',
    licenseNumber: 'HR-MD-11873',
  },
  {
    ...base,
    id: fakeId(1008),
    role: 'nurse',
    firstName: 'Ivana',
    lastName: 'Marić',
    email: 'ivana.maric@hospital.test',
  },
  {
    ...base,
    id: fakeId(1009),
    role: 'nurse',
    firstName: 'Old',
    lastName: 'Account',
    email: 'inactive@hospital.test',
    isActive: false,
  },
];

/** Demo login box: the first account of each role. */
export const DEMO_ACCOUNTS = STAFF.filter(
  (s, i) => s.isActive && STAFF.findIndex((o) => o.role === s.role) === i,
);
