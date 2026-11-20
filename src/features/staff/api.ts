import { useQuery } from '@tanstack/react-query';
import type { StaffRole } from '@/auth/types';
import { api } from '@/lib/api';

export interface StaffCard {
  id: string;
  role: StaffRole;
  firstName: string;
  lastName: string;
  licenseNumber: string | null;
}

/** Name card of a colleague. Cached for long: names don't change during a shift. */
export const useStaffCard = (id: string | null | undefined) =>
  useQuery({
    queryKey: ['staff', 'card', id],
    queryFn: ({ signal }) =>
      api<StaffCard>(`/identity/staff/${id}/card`, { signal }),
    enabled: !!id,
    staleTime: 60 * 60_000,
  });
