/** Same list as the backend (libs/contracts/src/roles.ts). */
export const STAFF_ROLES = [
  'doctor',
  'nurse',
  'lab_tech',
  'pharmacist',
  'receptionist',
  'admin',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<StaffRole, string> = {
  doctor: 'Doctor',
  nurse: 'Nurse',
  lab_tech: 'Lab technician',
  pharmacist: 'Pharmacist',
  receptionist: 'Receptionist',
  admin: 'Administrator',
};

/** GET /api/identity/staff/me */
export interface Staff {
  id: string;
  role: StaffRole;
  firstName: string;
  lastName: string;
  email: string;
  departmentId: string | null;
  licenseNumber: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
}
