import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type VitalType =
  | 'bp'
  | 'pulse'
  | 'resp_rate'
  | 'temperature'
  | 'spo2'
  | 'weight'
  | 'height'
  | 'pain'
  | 'glucose';

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
    label: 'Blood pressure',
    short: 'BP',
    unit: 'mmHg',
    min: 40,
    max: 300,
    step: '1',
  },
  pulse: {
    label: 'Pulse',
    short: 'Pulse',
    unit: '/min',
    min: 20,
    max: 300,
    step: '1',
  },
  resp_rate: {
    label: 'Breathing rate',
    short: 'Resp.',
    unit: '/min',
    min: 4,
    max: 80,
    step: '1',
  },
  temperature: {
    label: 'Temperature',
    short: 'Temp.',
    unit: '°C',
    min: 25,
    max: 45,
    step: '0.1',
  },
  spo2: {
    label: 'Oxygen saturation',
    short: 'SpO2',
    unit: '%',
    min: 50,
    max: 100,
    step: '1',
  },
  weight: {
    label: 'Weight',
    short: 'Weight',
    unit: 'kg',
    min: 0.3,
    max: 500,
    step: '0.1',
  },
  height: {
    label: 'Height',
    short: 'Height',
    unit: 'cm',
    min: 20,
    max: 250,
    step: '1',
  },
  pain: {
    label: 'Pain (0-10)',
    short: 'Pain',
    unit: '/10',
    min: 0,
    max: 10,
    step: '1',
  },
  glucose: {
    label: 'Blood sugar',
    short: 'Glucose',
    unit: 'mmol/L',
    min: 0.5,
    max: 50,
    step: '0.1',
  },
};
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
