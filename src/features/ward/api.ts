import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Ward {
  id: string;
  code: string;
  name: string;
  /** delivery = labor rooms, maternity = mothers, nursery/nicu = babies' cots */
  kind: 'general' | 'delivery' | 'maternity' | 'nursery' | 'nicu';
}

export interface Bed {
  bedId: string;
  bed: string;
  room: string;
  state: 'free' | 'occupied' | 'out_of_service';
  /** only when the patient is yours */
  admissionId?: string;
  patientId?: string;
  since?: string;
}

export const useWards = () =>
  useQuery({
    queryKey: ['wards'],
    queryFn: ({ signal }) => api<Ward[]>('/admissions/wards', { signal }),
    staleTime: 5 * 60_000, // wards rarely change
  });

export const useBedBoard = (wardId: string | undefined) =>
  useQuery({
    queryKey: ['wards', wardId, 'beds'],
    queryFn: ({ signal }) =>
      api<{ ward: Ward; beds: Bed[] }>(`/admissions/wards/${wardId}/beds`, {
        signal,
      }),
    enabled: !!wardId,
    // changes come live (bed.changed for this ward); the poll is only a safety net
    refetchInterval: 60_000,
  });
