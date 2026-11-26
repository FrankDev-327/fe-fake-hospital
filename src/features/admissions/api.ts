import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DischargeStep {
  step: 'close_encounter' | 'stop_medication';
  status: 'waiting' | 'pending' | 'done' | 'failed' | 'timed_out';
  detail: string | null;
}

/** GET /admissions/patients/:id/admissions (apps/admissions view()) */
export interface Admission {
  id: string;
  patientId: string;
  encounterId: string;
  status: 'active' | 'discharging' | 'discharged';
  bed: {
    bedId: string;
    ward: { id: string; code: string; name: string };
    room: string;
    bed: string;
  } | null;
  admittedBy: string;
  admittedAt: string;
  discharge: {
    requestedBy: string;
    requestedAt: string;
    failure: string | null;
    steps: DischargeStep[];
  } | null;
  dischargedAt: string | null;
  version: number;
}

const stays = (patientId: string) =>
  `/admissions/patients/${patientId}/admissions`;
export const admissionKeys = {
  of: (patientId: string) => ['patients', patientId, 'admissions'] as const,
};

export const useAdmissions = (patientId: string) =>
  useQuery({
    queryKey: admissionKeys.of(patientId),
    queryFn: ({ signal }) =>
      api<{ items: Admission[] }>(stays(patientId), { signal }),
    select: (d) => d.items,
    // while a discharge runs, also poll (in case the live stream is down)
    refetchInterval: (q) =>
      // (not when a step is stuck: nothing moves until someone presses Retry)
      q.state.data?.items.some(
        (a) =>
          a.status === 'discharging' &&
          !a.discharge?.steps.some(
            (s) => s.status === 'timed_out' || s.status === 'failed',
          ),
      )
        ? 2000
        : false,
  });

/** The stay that's still going (active or being discharged), if any */
export const currentStay = (items: Admission[] | undefined) =>
  items?.find((a) => a.status !== 'discharged');

export function useAdmissionActions(patientId: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    // the visit closes and meds stop on discharge: reload the whole chart and the boards
    void queryClient.invalidateQueries({ queryKey: ['patients', patientId] });
    void queryClient.invalidateQueries({ queryKey: ['wards'] });
  };
  const post = (path: string, body?: unknown) =>
    api<Admission>(`${stays(patientId)}${path}`, { method: 'POST', body });

  return {
    admit: useMutation({
      mutationFn: (input: { encounterId: string; bedId: string }) =>
        post('', input),
      onSuccess: refresh,
    }),
    transfer: useMutation({
      mutationFn: (input: {
        id: string;
        bedId: string;
        reason: string | null;
      }) =>
        post(`/${input.id}/transfer`, {
          bedId: input.bedId,
          reason: input.reason,
        }),
      onSuccess: refresh,
    }),
    discharge: useMutation({
      mutationFn: (id: string) => post(`/${id}/discharge`),
      onSuccess: refresh,
    }),
    retry: useMutation({
      mutationFn: (id: string) => post(`/${id}/discharge/retry`),
      onSuccess: refresh,
    }),
    abort: useMutation({
      mutationFn: (id: string) => post(`/${id}/discharge/abort`),
      onSuccess: refresh,
    }),
  };
}
