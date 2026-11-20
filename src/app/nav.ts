import type { StaffRole } from '@/auth/types';

/**
 * The menu. Each role sees only its own work. This is just the UI side: the BACKEND is what
 * really enforces access (a nurse calling a doctor-only endpoint still gets 403/404).
 */
export interface NavItem {
  to:
    | '/patients'
    | '/ward'
    | '/medication'
    | '/lab'
    | '/appointments'
    | '/admin'
    | '/reports';
  label: string;
  description: string;
  roles: readonly StaffRole[];
  /** slice that adds the actions (create/edit) for this section */
  slice: number;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/patients',
    label: 'Patients',
    description: 'Find, register and open patient charts',
    roles: ['doctor', 'nurse', 'receptionist'],
    slice: 2,
  },
  {
    to: '/ward',
    label: 'Ward board',
    description: 'Beds, admissions, transfers and discharges',
    roles: ['doctor', 'nurse'],
    slice: 7,
  },
  {
    to: '/medication',
    label: 'Medication',
    description: 'Medication round (nurse) or drug catalog (pharmacy)',
    roles: ['nurse', 'pharmacist'],
    slice: 4,
  },
  {
    to: '/lab',
    label: 'Lab worklist',
    description: 'Collect samples and enter results',
    roles: ['lab_tech'],
    slice: 6,
  },
  {
    to: '/appointments',
    label: 'Appointments',
    description: 'Availability and bookings',
    roles: ['doctor', 'receptionist'],
    slice: 9,
  },
  {
    to: '/admin',
    label: 'Administration',
    description: 'Staff accounts, assignments, wards and beds',
    roles: ['admin'],
    slice: 10,
  },
  {
    to: '/reports',
    label: 'Reports',
    description: 'Bed occupancy, critical lab results',
    roles: ['admin', 'doctor'],
    slice: 10,
  },
];

export const navFor = (role: StaffRole) =>
  NAV_ITEMS.filter((item) => item.roles.includes(role));
