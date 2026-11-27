import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { BadgeTone } from '@/components/ui';
import { api } from '@/lib/api';
import type { Bed, Ward } from '@/features/ward/api';
import { t } from '@/i18n';

/**
 * Births (backend slice 12, apps/admissions deliveries). A delivery is the hub: the mother,
 * her babies and the team who helped. Doctors and nurses can do all of it.
 */
export type DeliveryStatus = 'in_labor' | 'delivered' | 'cancelled';
export type BirthStatus = 'registering' | 'ready' | 'failed';
export type BabySex = 'female' | 'male' | 'unknown';

/** GET /admissions/deliveries?status= */
export interface DeliveryListItem {
  id: string;
  motherPatientId: string;
  status: DeliveryStatus;
  startedAt: string;
  deliveredAt: string | null;
  wardCode: string | null;
  room: string | null;
  bed: string | null;
  babies: number;
}

export interface Birth {
  babyPatientId: string;
  birthOrder: number;
  /** "A", "B" for twins... */
  label: string;
  sex: BabySex;
  bornAt: string;
  primaryDoctorId: string;
  babyAdmissionId: string;
  status: BirthStatus;
  failure: string | null;
  steps: {
    step: 'register_patient' | 'grant_access' | 'open_encounter';
    status: 'pending' | 'done' | 'failed' | 'timed_out';
    detail: string | null;
  }[];
}

/** GET /admissions/deliveries/:id */
export interface Delivery {
  id: string;
  motherPatientId: string;
  motherAdmissionId: string;
  status: DeliveryStatus;
  startedBy: string;
  startedAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  team: { staffId: string; role: 'doctor' | 'nurse'; addedAt: string }[];
  births: Birth[];
  version: number;
}

export interface RegisterBirthInput {
  sex: BabySex;
  /** ISO time; the backend takes "now" when missing */
  bornAt?: string;
  cotBedId: string;
  primaryDoctorId: string;
  team: { doctorIds: string[]; nurseIds: string[] };
}

/** GET /patients/patients/:id/relations */
export interface Relation {
  relation: 'mother' | 'child';
  patientId: string;
  mrn: string;
  firstName: string | null;
  lastName: string;
}

export const DELIVERY_STATUS: Record<
  DeliveryStatus,
  { label: string; tone: BadgeTone }
> = {
  in_labor: {
    get label() {
      return t('mat.sInLabor');
    },
    tone: 'amber',
  },
  delivered: {
    get label() {
      return t('mat.sDelivered');
    },
    tone: 'green',
  },
  cancelled: {
    get label() {
      return t('mat.sCancelled');
    },
    tone: 'gray',
  },
};

export const BIRTH_STATUS: Record<
  BirthStatus,
  { label: string; tone: BadgeTone }
> = {
  registering: {
    get label() {
      return t('mat.bRegistering');
    },
    tone: 'blue',
  },
  ready: {
    get label() {
      return t('mat.bReady');
    },
    tone: 'green',
  },
  failed: {
    get label() {
      return t('mat.bFailed');
    },
    tone: 'red',
  },
};

export const STEP_LABEL: Record<Birth['steps'][number]['step'], string> = {
  get register_patient() {
    return t('mat.stepPatient');
  },
  get grant_access() {
    return t('mat.stepAccess');
  },
  get open_encounter() {
    return t('mat.stepVisit');
  },
};

export const SEX_OPTIONS: { value: BabySex; label: string }[] = [
  {
    value: 'female',
    get label() {
      return t('mat.girl');
    },
  },
  {
    value: 'male',
    get label() {
      return t('mat.boy');
    },
  },
  {
    value: 'unknown',
    get label() {
      return t('mat.undetermined');
    },
  },
];

export const NEWBORN_WARD_KINDS: Ward['kind'][] = [
  'maternity',
  'nursery',
  'nicu',
];

export const deliveryKeys = {
  all: ['deliveries'] as const,
  list: (status: DeliveryStatus) => ['deliveries', 'list', status] as const,
  one: (id: string) => ['deliveries', id] as const,
};

export const useDeliveries = (status: DeliveryStatus) =>
  useQuery({
    queryKey: deliveryKeys.list(status),
    queryFn: ({ signal }) =>
      api<{ items: DeliveryListItem[] }>(
        `/admissions/deliveries?status=${status}`,
        { signal },
      ),
    select: (data) => data.items,
    refetchInterval: 30_000, // until live updates (SSE delivery.changed) come in
  });

export const useDelivery = (id: string) =>
  useQuery({
    queryKey: deliveryKeys.one(id),
    queryFn: ({ signal }) =>
      api<Delivery>(`/admissions/deliveries/${id}`, { signal }),
    // the birth saga runs in the background (202): ask again every second until it's done
    refetchInterval: (query) =>
      query.state.data?.births.some((b) => b.status === 'registering')
        ? 1000
        : false,
  });

/** Beds of several wards at once (one request per ward, run in parallel) */
export function useBedsOf(wards: Ward[]) {
  return useQueries({
    queries: wards.map((w) => ({
      queryKey: ['wards', w.id, 'beds'],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api<{ ward: Ward; beds: Bed[] }>(`/admissions/wards/${w.id}/beds`, {
          signal,
        }),
    })),
  });
}

export interface NurseCard {
  id: string;
  firstName: string;
  lastName: string;
}

/** Active nurses (cards) for the birth team picker */
export const useNurses = () =>
  useQuery({
    queryKey: ['staff', 'nurses'],
    queryFn: ({ signal }) =>
      api<{ items: NurseCard[] }>('/identity/staff/nurses', { signal }),
    select: (data) => data.items,
    staleTime: 5 * 60_000,
  });

export const useRelations = (patientId: string) =>
  useQuery({
    queryKey: ['patients', patientId, 'relations'],
    queryFn: ({ signal }) =>
      api<{ items: Relation[] }>(`/patients/patients/${patientId}/relations`, {
        signal,
      }),
    select: (data) => data.items,
  });

export function useDeliveryActions() {
  const queryClient = useQueryClient();
  const refresh = (d?: Delivery) => {
    if (d) queryClient.setQueryData(deliveryKeys.one(d.id), d);
    void queryClient.invalidateQueries({ queryKey: deliveryKeys.all });
    // beds changed (a cot is taken) and new patients exist (the baby)
    void queryClient.invalidateQueries({ queryKey: ['wards'] });
    void queryClient.invalidateQueries({ queryKey: ['patients'] });
  };

  const startLabor = useMutation({
    mutationFn: (motherPatientId: string) =>
      api<Delivery>(`/admissions/patients/${motherPatientId}/deliveries`, {
        method: 'POST',
      }),
    onSuccess: refresh,
  });

  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api<Delivery>(`/admissions/deliveries/${id}/cancel`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: refresh,
  });

  const registerBirth = useMutation({
    mutationFn: ({ id, input }: { id: string; input: RegisterBirthInput }) =>
      api<{
        babyPatientId: string;
        label: string;
        delivery: Delivery;
      }>(`/admissions/deliveries/${id}/births`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (res) => refresh(res.delivery),
  });

  const retry = useMutation({
    mutationFn: ({
      id,
      babyPatientId,
    }: {
      id: string;
      babyPatientId: string;
    }) =>
      api<Delivery>(
        `/admissions/deliveries/${id}/births/${babyPatientId}/retry`,
        { method: 'POST' },
      ),
    onSuccess: () => refresh(),
  });

  return { startLabor, cancel, registerBirth, retry };
}
