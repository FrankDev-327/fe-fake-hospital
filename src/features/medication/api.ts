import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { t } from '@/i18n';

export interface Prescription {
  id: string;
  encounterId: string;
  medication: {
    id: string;
    name: string;
    atcCode: string;
    form: string;
    strength: string;
  };
  prescribedBy: string;
  /** a decimal as a string, like the backend sends it: "1.000" */
  doseAmount: string;
  doseUnit: string;
  route: string;
  intervalHours: number | null;
  asNeeded: boolean;
  instructions: string | null;
  startsAt: string;
  endsAt: string | null;
  status: 'active' | 'stopped' | 'completed' | 'entered_in_error';
  isCurrent: boolean;
  overrideReason: string | null;
  stoppedBy: string | null;
  stoppedAt: string | null;
  stopReason: string | null;
  lastGivenAt: string | null;
}

export interface CatalogMedication {
  id: string;
  name: string;
  activeIngredient: string;
  atcCode: string;
  form: string;
  strength: string;
}

export interface Administration {
  id: string;
  prescriptionId: string;
  administeredBy: string;
  status: 'given' | 'skipped' | 'refused';
  doseAmount: string | null;
  doseUnit: string | null;
  administeredAt: string;
  note: string | null;
}

/** A safety check result from the backend (allergy match, duplicate therapy...) */
export interface CheckIssue {
  code:
    | 'allergy_match'
    | 'allergy_data_stale'
    | 'duplicate_therapy'
    | 'allergies_need_manual_check';
  message: string;
}

export const DOSE_UNITS = [
  'mg',
  'g',
  'mcg',
  'ml',
  'IU',
  'U',
  'tablet',
  'capsule',
  'drop',
  'puff',
] as const;
export const ROUTES = [
  'oral',
  'iv',
  'im',
  'sc',
  'topical',
  'inhaled',
  'rectal',
  'sublingual',
] as const;

export const ROUTE_LABEL: Record<string, string> = {
  get oral() {
    return t('med.rtOral');
  },
  iv: 'IV',
  im: 'IM',
  get sc() {
    return t('med.rtSc');
  },
  get topical() {
    return t('med.rtTopical');
  },
  get inhaled() {
    return t('med.rtInhaled');
  },
  get rectal() {
    return t('med.rtRectal');
  },
  get sublingual() {
    return t('med.rtSub');
  },
};

/** "1.000" -> "1", "0.250" -> "0.25" */
export const formatAmount = (amount: string | number) => String(Number(amount));

/** "1 g IV every 24 h" / "1000 mg oral as needed" */
export const doseText = (p: Prescription) =>
  `${formatAmount(p.doseAmount)} ${p.doseUnit} ${ROUTE_LABEL[p.route] ?? p.route} ${
    p.asNeeded
      ? t('med.asNeededLower')
      : t('med.everyH', { hours: p.intervalHours })
  }`;

/** When the next scheduled dose is due (null for "as needed"; never given = due from the start). */
export function nextDue(p: Prescription): Date | null {
  if (p.asNeeded || !p.intervalHours) return null;
  if (!p.lastGivenAt) return new Date(p.startsAt);
  return new Date(Date.parse(p.lastGivenAt) + p.intervalHours * 3_600_000);
}

const base = (patientId: string) =>
  `/medication/patients/${patientId}/prescriptions`;

/** Everything about a patient's medication starts with this key (one invalidate refreshes all) */
const medKey = (patientId: string) =>
  ['patients', patientId, 'prescriptions'] as const;

const prescriptionsQuery = (patientId: string, active = true) => ({
  queryKey: [...medKey(patientId), active ? 'active' : 'all'],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    api<{ items: Prescription[] }>(`${base(patientId)}?active=${active}`, {
      signal,
    }),
  select: (data: { items: Prescription[] }) => data.items,
});

export const usePrescriptions = (patientId: string, enabled = true) =>
  useQuery({ ...prescriptionsQuery(patientId), enabled });

/** One request per patient, all in parallel (the round needs every patient's list). */
export const usePrescriptionsFor = (patientIds: string[]) =>
  useQueries({ queries: patientIds.map((id) => prescriptionsQuery(id)) });

export const useAdministrations = (
  patientId: string,
  prescriptionId: string,
  enabled: boolean,
) =>
  useQuery({
    queryKey: [...medKey(patientId), prescriptionId, 'administrations'],
    queryFn: ({ signal }) =>
      api<{ items: Administration[] }>(
        `${base(patientId)}/${prescriptionId}/administrations`,
        {
          signal,
        },
      ),
    select: (data) => data.items,
    enabled,
  });

export interface PrescribeInput {
  encounterId: string;
  medicationId: string;
  doseAmount: number;
  doseUnit: string;
  route: string;
  intervalHours: number | null;
  asNeeded: boolean;
  instructions: string | null;
  endsAt: string | null;
  overrideReason: string | null;
  acknowledgeWarnings: boolean;
}

export function useMedicationActions(patientId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () =>
    queryClient.invalidateQueries({ queryKey: medKey(patientId) });

  const prescribe = useMutation({
    mutationFn: (input: PrescribeInput) =>
      api<{
        prescription: Prescription;
        warnings: CheckIssue[];
        overridden: CheckIssue[];
      }>(base(patientId), { method: 'POST', body: input }),
    onSuccess,
  });
  const stop = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api<Prescription>(`${base(patientId)}/${id}/stop`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess,
  });
  const markError = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api<Prescription>(`${base(patientId)}/${id}/void`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess,
  });
  const recordDose = useMutation({
    mutationFn: ({
      prescriptionId,
      ...body
    }: {
      prescriptionId: string;
      idempotencyKey: string;
      status: Administration['status'];
      doseAmount?: number;
      note: string | null;
      confirmEarlyDose: boolean;
    }) =>
      api<{ replayed: boolean; administration: Administration }>(
        `${base(patientId)}/${prescriptionId}/administrations`,
        { method: 'POST', body },
      ),
    onSuccess,
  });
  return { prescribe, stop, markError, recordDose };
}

export const useMedicationCatalog = (q: string) =>
  useQuery({
    queryKey: ['medications', q],
    queryFn: ({ signal }) =>
      api<CatalogMedication[]>(
        `/medication/medications?q=${encodeURIComponent(q)}`,
        { signal },
      ),
    enabled: q.trim().length >= 2,
    staleTime: 60 * 60_000,
  });
