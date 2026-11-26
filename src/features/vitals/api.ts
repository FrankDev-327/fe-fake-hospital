import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { t } from '@/i18n';

export type VitalType =
  | 'bp'
  | 'pulse'
  | 'resp_rate'
  | 'temperature'
  | 'spo2'
  | 'weight'
  | 'height'
  | 'pain'
  | 'glucose'
  /** newborns: Apgar score 1, 5 and 10 minutes after birth */
  | 'apgar_1'
  | 'apgar_5'
  | 'apgar_10';

export interface Observation {
  id: string;
  encounterId: string;
  type: VitalType;
  value: number;
  /** diastolic, only for bp */
  value2: number | null;
  unit: string;
  status: 'active' | 'entered_in_error';
  errorReason: string | null;
  recordedBy: string;
  recordedAt: string;
}

/**
 * Everything the UI needs per vital sign. min/max are the backend's PLAUSIBLE ranges (catch
 * "375" typed for 37.5), not normal ranges: a real alarming value must still be recordable.
 */
function apgar(minute: number) {
  return {
    get label() {
      return t('vitals.apgarLabel', { minute });
    },
    get short() {
      return t('vitals.apgarShort', { minute });
    },
    unit: '/10',
    min: 0,
    max: 10,
    step: '1',
  };
}

export const VITALS: Record<
  VitalType,
  {
    label: string;
    short: string;
    unit: string;
    min: number;
    max: number;
    step: string;
  }
> = {
  bp: {
    get label() {
      return t('vitals.lBp');
    },
    get short() {
      return t('vitals.sBp');
    },
    unit: 'mmHg',
    min: 40,
    max: 300,
    step: '1',
  },
  pulse: {
    get label() {
      return t('vitals.lPulse');
    },
    get short() {
      return t('vitals.lPulse');
    },
    unit: '/min',
    min: 20,
    max: 300,
    step: '1',
  },
  resp_rate: {
    get label() {
      return t('vitals.lResp');
    },
    get short() {
      return t('vitals.sResp');
    },
    unit: '/min',
    min: 4,
    max: 80,
    step: '1',
  },
  temperature: {
    get label() {
      return t('vitals.lTemp');
    },
    get short() {
      return t('vitals.sTemp');
    },
    unit: '°C',
    min: 25,
    max: 45,
    step: '0.1',
  },
  spo2: {
    get label() {
      return t('vitals.lSpo2');
    },
    short: 'SpO2',
    unit: '%',
    min: 50,
    max: 100,
    step: '1',
  },
  weight: {
    get label() {
      return t('vitals.lWeight');
    },
    get short() {
      return t('vitals.lWeight');
    },
    unit: 'kg',
    min: 0.3,
    max: 500,
    step: '0.1',
  },
  height: {
    get label() {
      return t('vitals.lHeight');
    },
    get short() {
      return t('vitals.lHeight');
    },
    unit: 'cm',
    min: 20,
    max: 250,
    step: '1',
  },
  pain: {
    get label() {
      return t('vitals.lPain');
    },
    get short() {
      return t('vitals.sPain');
    },
    unit: '/10',
    min: 0,
    max: 10,
    step: '1',
  },
  glucose: {
    get label() {
      return t('vitals.lGlucose');
    },
    get short() {
      return t('vitals.sGlucose');
    },
    unit: 'mmol/L',
    min: 0.5,
    max: 50,
    step: '0.1',
  },
  apgar_1: apgar(1),
  apgar_5: apgar(5),
  apgar_10: apgar(10),
};
export const APGAR_TYPES: VitalType[] = ['apgar_1', 'apgar_5', 'apgar_10'];

/** Whole numbers only (scores) */
export const isScore = (t: VitalType) =>
  t === 'pain' || APGAR_TYPES.includes(t);

export const VITAL_ORDER: VitalType[] = [
  'bp',
  'pulse',
  'temperature',
  'spo2',
  'resp_rate',
  'glucose',
  'pain',
  'weight',
  'height',
  ...APGAR_TYPES,
];

/** "124/76 mmHg", "37.4 °C" */
export const formatVital = (
  o: Pick<Observation, 'type' | 'value' | 'value2'>,
) =>
  o.type === 'bp'
    ? `${o.value}/${o.value2} ${VITALS.bp.unit}`
    : `${o.value} ${VITALS[o.type].unit}`;

const vitalsKey = (patientId: string) =>
  ['patients', patientId, 'vitals'] as const;
const base = (patientId: string) => `/clinical/patients/${patientId}`;

/** All readings, newest first (one request; the chart and the table filter it) */
export const useVitals = (patientId: string) =>
  useQuery({
    queryKey: vitalsKey(patientId),
    queryFn: ({ signal }) =>
      api<{ items: Observation[] }>(`${base(patientId)}/vitals`, { signal }),
    select: (data) => data.items,
  });

export interface Reading {
  type: VitalType;
  value: number;
  value2?: number;
}

export function useVitalsActions(patientId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () =>
    queryClient.invalidateQueries({ queryKey: vitalsKey(patientId) });
  const record = useMutation({
    mutationFn: ({
      encounterId,
      readings,
    }: {
      encounterId: string;
      readings: Reading[];
    }) =>
      api<{ items: Observation[] }>(
        `${base(patientId)}/encounters/${encounterId}/vitals`,
        {
          method: 'POST',
          body: { readings },
        },
      ),
    onSuccess,
  });
  const markError = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api<Observation>(`${base(patientId)}/vitals/${id}/void`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess,
  });
  return { record, markError };
}
