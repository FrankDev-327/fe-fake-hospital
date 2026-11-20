import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { TextAreaField } from '@/components/fields';
import { Modal } from '@/components/Modal';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/toast-context';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { doseText, formatAmount, useMedicationActions } from './api';
import type { Administration, Prescription } from './api';

const STATUS_LABEL: Record<Administration['status'], string> = {
  given: 'Given',
  skipped: 'Skipped',
  refused: 'Refused by patient',
};

/**
 * Record one dose (the digital medication chart).
 * idempotencyKey: made ONCE when the dialog opens. If the nurse taps twice or the network
 * retries, the backend sees the same key and records the dose only once.
 */
export function RecordDoseDialog({
  patientId,
  patientLabel,
  prescription: rx,
  onClose,
}: {
  patientId: string;
  patientLabel: string;
  prescription: Prescription;
  onClose: () => void;
}) {
  const { recordDose } = useMedicationActions(patientId);
  const toast = useToast();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState<Administration['status']>('given');
  const [amount, setAmount] = useState(formatAmount(rx.doseAmount));
  const [note, setNote] = useState('');
  const [confirmEarly, setConfirmEarly] = useState(false);

  const error = recordDose.error instanceof ApiError ? recordDose.error : null;
  const tooSoon =
    error?.code === 'dose_too_soon'
      ? (error.body as { lastGivenAt: string; intervalHours: number })
      : null;
  const differs =
    status === 'given' && Number(amount) !== Number(rx.doseAmount);
  // when a note is required (the backend refuses otherwise)
  const noteRequired = status !== 'given' || differs || !!tooSoon;
  const noteOk = !noteRequired || note.trim().length >= 3;
  const amountOk = status !== 'given' || Number(amount) > 0;

  return (
    <Modal title="Record dose" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <div className="font-medium">
            {rx.medication.name} {rx.medication.strength}
          </div>
          <div className="text-slate-600">
            {doseText(rx)} · {patientLabel}
          </div>
          {rx.instructions && (
            <div className="text-slate-500 italic">{rx.instructions}</div>
          )}
        </div>

        <fieldset className="flex gap-4">
          <legend className="sr-only">What happened</legend>
          {(Object.keys(STATUS_LABEL) as Administration['status'][]).map(
            (s) => (
              <label key={s} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dose-status"
                  checked={status === s}
                  onChange={() => setStatus(s)}
                />
                {STATUS_LABEL[s]}
              </label>
            ),
          )}
        </fieldset>

        {status === 'given' && (
          <TextField
            label={`Dose given (${rx.doseUnit})`}
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={
              differs
                ? `Ordered ${formatAmount(rx.doseAmount)} ${rx.doseUnit}: explain in the note`
                : undefined
            }
          />
        )}

        {tooSoon && (
          <div
            role="alert"
            className="space-y-2 rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-amber-900"
          >
            <strong>Too soon</strong>
            <p>
              Last given {formatDateTime(tooSoon.lastGivenAt)}, ordered every{' '}
              {tooSoon.intervalHours} h.
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={confirmEarly}
                onChange={(e) => setConfirmEarly(e.target.checked)}
              />
              Give it early anyway (explain in the note)
            </label>
          </div>
        )}

        <TextAreaField
          label={noteRequired ? 'Note (required)' : 'Note (optional)'}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          hint={
            status === 'skipped'
              ? 'Why was it skipped? e.g. Patient fasting for surgery'
              : undefined
          }
        />

        {error && !tooSoon && (
          <Alert>
            {errorMessage(error, {
              prescription_not_running:
                'This prescription is not running anymore (stopped or ended).',
              dose_unit_mismatch: 'The unit does not match the prescription.',
              dose_differs_from_order:
                'The dose differs from the order: add a note.',
            })}
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              !noteOk ||
              !amountOk ||
              (tooSoon !== null && !confirmEarly) ||
              recordDose.isPending
            }
            onClick={() =>
              recordDose.mutate(
                {
                  prescriptionId: rx.id,
                  idempotencyKey,
                  status,
                  doseAmount: status === 'given' ? Number(amount) : undefined,
                  note: note.trim() || null,
                  confirmEarlyDose: confirmEarly,
                },
                {
                  onSuccess: () => {
                    toast(
                      `${rx.medication.name}: ${STATUS_LABEL[status].toLowerCase()}`,
                    );
                    onClose();
                  },
                },
              )
            }
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
