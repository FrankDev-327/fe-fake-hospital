import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Ward {
  id: string;
  code: string;
  name: string;
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
    refetchInterval: 30_000, // until live updates (SSE) come in slice 7
  });
