import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { BadgeTone } from '@/components/ui';
import { t } from '@/i18n';

export interface Appointment {
  id: string;
  patientId: string;
  startsAt: string;
  endsAt: string;
  visitType: 'first_visit' | 'follow_up' | 'procedure' | 'consultation';
  status: 'booked' | 'cancelled' | 'completed' | 'no_show';
  /**
   * From the patients service. null when it couldn't be reached (the list still shows the
   * times); firstName null for a newborn without a name yet.
   */
  patient: { mrn: string; firstName: string | null; lastName: string } | null;
}

export interface DoctorCard {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string | null;
}

export const VISIT_LABEL: Record<Appointment['visitType'], string> = {
  get first_visit() {
    return t('appt.first');
  },
  get follow_up() {
    return t('appt.followUp');
  },
  get procedure() {
    return t('appt.procedure');
  },
  get consultation() {
    return t('appt.consult');
  },
};

export const STATUS: Record<
  Appointment['status'],
  { label: string; tone: BadgeTone }
> = {
  booked: {
    get label() {
      return t('appt.booked');
    },
    tone: 'blue',
  },
  completed: {
    get label() {
      return t('appt.done');
    },
    tone: 'green',
  },
  cancelled: {
    get label() {
      return t('appt.cancelled');
    },
    tone: 'gray',
  },
  no_show: {
    get label() {
      return t('appt.noShow');
    },
    tone: 'amber',
  },
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

/** Active doctors (cards) for the front desk's doctor picker */
export const useDoctors = (enabled = true) =>
  useQuery({
    queryKey: ['staff', 'doctors'],
    queryFn: ({ signal }) =>
      api<{ items: DoctorCard[] }>('/identity/staff/doctors', { signal }),
    select: (data) => data.items,
    enabled,
    staleTime: 5 * 60_000,
  });
