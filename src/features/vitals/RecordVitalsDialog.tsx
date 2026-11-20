import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/toast-context';
import { errorMessage } from '@/lib/errors';
import { useVitalsActions } from './api';
import type { VitalType } from './api';
import { toReadings } from './readings';
import type { Values } from './readings';

/** One bedside round: fill what was measured, leave the rest empty. */
export function RecordVitalsDialog({
  patientId,
  encounterId,
  onClose,
}: {
  patientId: string;
  encounterId: string;
  onClose: () => void;
}) {
  const { record } = useVitalsActions(patientId);
  const toast = useToast();
  const [values, setValues] = useState<Values>({});
  const [showErrors, setShowErrors] = useState(false);
  const { readings, errors } = toReadings(values);
  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const field = (key: VitalType | 'bp2', label: string) => {
    const error = showErrors ? errors[key] : undefined;
    const id = `vital-${key}`;
    return (
      <div className="space-y-1">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-slate-700"
        >
          {label}
        </label>
        <input
          id={id}
          inputMode="decimal"
          value={values[key] ?? ''}
          onChange={set(key)}
          aria-invalid={error ? true : undefined}
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 focus:outline-none aria-invalid:border-red-500"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  };

  return (
    <Modal title="Record vitals" onClose={onClose}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setShowErrors(true);
          if (Object.keys(errors).length || !readings.length) return;
          record.mutate(
            { encounterId, readings },
            {
              onSuccess: () => {
                toast(
                  `${readings.length} reading${readings.length > 1 ? 's' : ''} saved`,
                );
                onClose();
              },
            },
          );
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          {field('bp', 'BP systolic (mmHg)')}
          {field('bp2', 'BP diastolic (mmHg)')}
          {field('pulse', 'Pulse (/min)')}
          {field('temperature', 'Temperature (°C)')}
          {field('spo2', 'SpO2 (%)')}
          {field('resp_rate', 'Breathing rate (/min)')}
          {field('glucose', 'Blood sugar (mmol/L)')}
          {field('pain', 'Pain (0-10)')}
          {field('weight', 'Weight (kg)')}
          {field('height', 'Height (cm)')}
        </div>
        {showErrors && !readings.length && !Object.keys(errors).length && (
          <Alert>Fill in at least one value.</Alert>
        )}
        {record.error && (
          <Alert>
            {errorMessage(record.error, {
              encounter_closed:
                'The visit is closed: vitals go into an open visit.',
            })}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={record.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
