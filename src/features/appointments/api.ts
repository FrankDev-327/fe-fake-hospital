import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { BadgeTone } from '@/components/ui';

export interface Appointment {
  id: string;
  patientId: string;
  startsAt: string;
  endsAt: string;
  visitType: 'first_visit' | 'follow_up' | 'procedure' | 'consultation';
  status: 'booked' | 'cancelled' | 'completed' | 'no_show';
  /** NOT IN THE BACKEND YET (see docs/plan.md "Backend gaps") */
  patient: { mrn: string; firstName: string; lastName: string };
}

export interface DoctorCard {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string | null;
}

export const VISIT_LABEL: Record<Appointment['visitType'], string> = {
  first_visit: 'First visit',
  follow_up: 'Follow-up',
  procedure: 'Procedure',
  consultation: 'Consultation',
};

export const STATUS: Record<
  Appointment['status'],
  { label: string; tone: BadgeTone }
> = {
  booked: { label: 'Booked', tone: 'blue' },
  completed: { label: 'Done', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
  no_show: { label: 'No-show', tone: 'amber' },
};

/** from/to: "YYYY-MM-DD", both included */
export const useSchedule = (
  doctorId: string | undefined,
  from: string,
  to: string,
) =>
  useQuery({
    queryKey: ['appointments', doctorId, from, to],
    queryFn: ({ signal }) =>
      api<{ items: Appointment[] }>(
        `/admissions/doctors/${doctorId}/appointments?from=${from}&to=${to}`,
        { signal },
      ),
    select: (data) => data.items,
    enabled: !!doctorId,
  });

/** NOT IN THE BACKEND YET: list of doctors for the front desk */
export const useDoctors = (enabled = true) =>
  useQuery({
    queryKey: ['staff', 'doctors'],
    queryFn: ({ signal }) =>
      api<{ items: DoctorCard[] }>('/identity/staff/doctors', { signal }),
    select: (data) => data.items,
    enabled,
    staleTime: 5 * 60_000,
  });
