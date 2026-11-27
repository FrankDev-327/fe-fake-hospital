import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BadgeTone } from '@/components/ui';
import { api } from '@/lib/api';
import { t } from '@/i18n';

/** A test from the catalog (LOINC code, unit, normal and critical limits) */
export interface LabTest {
  code: string;
  name: string;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  criticalLow: number | null;
  criticalHigh: number | null;
}

export type LabFlag =
  'normal' | 'low' | 'high' | 'critical_low' | 'critical_high';
export type LabOrderStatus = 'ordered' | 'collected' | 'resulted' | 'cancelled';

export interface LabResult {
  id: string;
  labOrderId: string;
  testCode: string;
  value: number | null;
  valueText: string | null;
  unit: string;
  flag: LabFlag | null;
  critical: boolean;
  /** only for critical results: has a doctor confirmed seeing it? */
  acknowledged?: boolean;
  resultedBy: string;
  resultedAt: string;
}

/** The patient's view of an order: tests with names and ranges, current results */
export interface LabOrder {
  id: string;
  encounterId: string;
  orderedBy: string;
  priority: 'routine' | 'urgent';
  status: LabOrderStatus;
  orderedAt: string;
  collectedAt: string | null;
  tests: {
    code: string;
    name: string;
    unit: string;
    refLow: number | null;
    refHigh: number | null;
  }[];
  results: LabResult[];
}

/** The lab's worklist item: ids and codes only (the lab doesn't see charts) */
export interface WorklistItem {
  id: string;
  patientId: string;
  priority: 'routine' | 'urgent';
  status: 'ordered' | 'collected';
  orderedAt: string;
  collectedAt: string | null;
  tests: string[];
}
export type WorklistStatus = WorklistItem['status'];

export const FLAG: Record<LabFlag, { label: string; tone: BadgeTone } | null> =
  {
    normal: null,
    low: {
      get label() {
        return t('lab.fLow');
      },
      tone: 'amber',
    },
    high: {
      get label() {
        return t('lab.fHigh');
      },
      tone: 'amber',
    },
    critical_low: {
      get label() {
        return t('lab.fCritLow');
      },
      tone: 'red',
    },
    critical_high: {
      get label() {
        return t('lab.fCritHigh');
      },
      tone: 'red',
    },
  };

export const ORDER_STATUS: Record<
  LabOrderStatus,
  { label: string; tone: BadgeTone }
> = {
  ordered: {
    get label() {
      return t('lab.toCollect');
    },
    tone: 'blue',
  },
  collected: {
    get label() {
      return t('lab.sAtLab');
    },
    tone: 'teal',
  },
  resulted: {
    get label() {
      return t('lab.sReady');
    },
    tone: 'green',
  },
  cancelled: {
    get label() {
      return t('lab.sCancelled');
    },
    tone: 'gray',
  },
};

/** Same rule as the backend (lab-flags.ts), used to preview the flag while typing */
export function flagFor(test: LabTest, value: number): LabFlag {
  if (test.criticalLow !== null && value < test.criticalLow)
    return 'critical_low';
  if (test.criticalHigh !== null && value > test.criticalHigh)
    return 'critical_high';
  if (test.refLow !== null && value < test.refLow) return 'low';
  if (test.refHigh !== null && value > test.refHigh) return 'high';
  return 'normal';
}

/** "120–160" */
export const rangeText = (t: {
  refLow: number | null;
  refHigh: number | null;
}) =>
  t.refLow === null && t.refHigh === null
    ? ''
    : `${t.refLow ?? ''}–${t.refHigh ?? ''}`;

/** The lab test catalog (GET /clinical/lab-tests) */
export const useLabTests = () =>
  useQuery({
    queryKey: ['lab-tests'],
    queryFn: ({ signal }) => api<LabTest[]>('/clinical/lab-tests', { signal }),
    staleTime: 60 * 60_000,
  });

// ---------- treating team (one patient) ----------

const ordersKey = (patientId: string) =>
  ['patients', patientId, 'lab-orders'] as const;
const chart = (patientId: string) => `/clinical/patients/${patientId}`;

export const useLabOrders = (patientId: string) =>
  useQuery({
    queryKey: ordersKey(patientId),
    queryFn: ({ signal }) =>
      api<{ items: LabOrder[] }>(`${chart(patientId)}/lab-orders`, { signal }),
    select: (data) => data.items,
  });

export function useLabActions(patientId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () =>
    queryClient.invalidateQueries({ queryKey: ordersKey(patientId) });
  const order = useMutation({
    mutationFn: ({
      encounterId,
      ...body
    }: {
      encounterId: string;
      tests: string[];
      priority: 'routine' | 'urgent';
    }) =>
      api<LabOrder>(
        `${chart(patientId)}/encounters/${encounterId}/lab-orders`,
        { method: 'POST', body },
      ),
    onSuccess,
  });
  const collect = useMutation({
    mutationFn: (orderId: string) =>
      api<LabOrder>(`${chart(patientId)}/lab-orders/${orderId}/collect`, {
        method: 'POST',
      }),
    onSuccess,
  });
  const cancel = useMutation({
    mutationFn: (orderId: string) =>
      api<LabOrder>(`${chart(patientId)}/lab-orders/${orderId}/cancel`, {
        method: 'POST',
      }),
    onSuccess,
  });
  const acknowledge = useMutation({
    mutationFn: (resultId: string) =>
      api<unknown>(`${chart(patientId)}/lab-results/${resultId}/acknowledge`, {
        method: 'POST',
      }),
    onSuccess,
  });
  return { order, collect, cancel, acknowledge };
}

// ---------- lab technician (worklist) ----------

export const useWorklist = (status: WorklistStatus) =>
  useQuery({
    queryKey: ['lab', 'worklist', status],
    queryFn: ({ signal }) =>
      api<{ items: WorklistItem[] }>(
        `/clinical/lab/worklist?status=${status}`,
        { signal },
      ),
    select: (data) => data.items,
    refetchInterval: 30_000,
  });

export function useLabWorkActions() {
  const queryClient = useQueryClient();
  const onSuccess = () =>
    queryClient.invalidateQueries({ queryKey: ['lab', 'worklist'] });
  const collect = useMutation({
    mutationFn: (orderId: string) =>
      api<unknown>(`/clinical/lab/orders/${orderId}/collect`, {
        method: 'POST',
      }),
    onSuccess,
  });
  const enterResults = useMutation({
    mutationFn: ({
      orderId,
      results,
    }: {
      orderId: string;
      results: { testCode: string; value: number }[];
    }) =>
      api<{ orderStatus: string; results: LabResult[] }>(
        `/clinical/lab/orders/${orderId}/results`,
        {
          method: 'POST',
          body: { results },
        },
      ),
    onSuccess,
  });
  return { collect, enterResults };
}
