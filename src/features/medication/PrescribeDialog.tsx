import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { SelectField, TextAreaField } from '@/components/fields';
import { Modal } from '@/components/Modal';
import { TextField } from '@/components/TextField';
import { QueryState } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import {
  DOSE_UNITS,
  ROUTE_LABEL,
  ROUTES,
  useMedicationActions,
  useMedicationCatalog,
} from './api';
import type { CatalogMedication, CheckIssue } from './api';

/** Sensible first guesses from the drug's form; the doctor can change them */
const DEFAULT_ROUTE: Record<string, string> = {
  injection: 'iv',
  inhaler: 'inhaled',
  tablet: 'oral',
  capsule: 'oral',
};
const unitOf = (strength: string) =>
  DOSE_UNITS.find((u) => strength.endsWith(` ${u}`)) ?? 'mg';
const amountOf = (strength: string) => Number.parseFloat(strength) || '';

/**
 * Prescribing, with the backend's safety checks:
 *   1st try -> 409 prescription_blocked (e.g. allergy): only with a written override reason
 *           -> 409 warnings_need_acknowledgement (e.g. same drug twice): tick "I've checked"
 *   then send again with overrideReason / acknowledgeWarnings.
 */
export function PrescribeDialog({
  patientId,
  encounterId,
  onClose,
}: {
  patientId: string;
  encounterId: string;
  onClose: () => void;
}) {
  const { prescribe } = useMedicationActions(patientId);
  const toast = useToast();
  const [drug, setDrug] = useState<CatalogMedication | null>(null);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<string>('mg');
  const [route, setRoute] = useState<string>('oral');
  const [asNeeded, setAsNeeded] = useState(false);
  const [intervalHours, setIntervalHours] = useState('24');
  const [instructions, setInstructions] = useState('');
  // safety checks the backend raised, and the doctor's answers to them
  const [blocking, setBlocking] = useState<CheckIssue[]>([]);
  const [warnings, setWarnings] = useState<CheckIssue[]>([]);
  const [overrideReason, setOverrideReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  const pick = (d: CatalogMedication) => {
    setDrug(d);
    setAmount(String(amountOf(d.strength)));
    setUnit(unitOf(d.strength));
    setRoute(DEFAULT_ROUTE[d.form] ?? 'oral');
    setBlocking([]);
    setWarnings([]);
  };

  const amountOk = Number(amount) > 0;
  const intervalOk =
    asNeeded ||
    (Number.isInteger(Number(intervalHours)) &&
      Number(intervalHours) >= 1 &&
      Number(intervalHours) <= 168);
  const answeredChecks =
    (!blocking.length || overrideReason.trim().length >= 3) &&
    (!warnings.length || acknowledged);
  const canSubmit =
    drug && amountOk && intervalOk && answeredChecks && !prescribe.isPending;

  const submit = () => {
    if (!drug) return;
    prescribe.mutate(
      {
        encounterId,
        medicationId: drug.id,
        doseAmount: Number(amount),
        doseUnit: unit,
        route,
        asNeeded,
        intervalHours: asNeeded ? null : Number(intervalHours),
        instructions: instructions.trim() || null,
        endsAt: null,
        overrideReason: blocking.length ? overrideReason.trim() : null,
        acknowledgeWarnings: acknowledged,
      },
      {
        onSuccess: ({ prescription }) => {
          toast(`Prescribed ${prescription.medication.name}`);
          onClose();
        },
        onError: (e) => {
          // the checks come back in the 409 body: show them and ask for an answer
          if (
            e instanceof ApiError &&
            (e.code === 'prescription_blocked' ||
              e.code === 'warnings_need_acknowledgement')
          ) {
            const body = e.body as {
              blocking: CheckIssue[];
              warnings: CheckIssue[];
            };
            setBlocking(body.blocking);
            setWarnings(body.warnings);
          }
        },
      },
    );
  };

  const otherError =
    prescribe.error instanceof ApiError &&
    !['prescription_blocked', 'warnings_need_acknowledgement'].includes(
      prescribe.error.code ?? '',
    )
      ? errorMessage(prescribe.error, {
          encounter_not_open:
            'The visit is closed: prescribe in an open visit.',
          unknown_medication: 'This drug is not in the catalog anymore.',
        })
      : null;

  return (
    <Modal title="Prescribe" onClose={onClose}>
      <div className="space-y-4">
        {drug ? (
          <div className="flex items-center justify-between rounded-md border border-teal-300 bg-teal-50 px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{drug.name}</span> {drug.strength}{' '}
              {drug.form}{' '}
              <span className="font-mono text-xs text-slate-500">
                {drug.atcCode}
              </span>
            </span>
            <Button
              variant="ghost"
              className="py-1"
              onClick={() => setDrug(null)}
            >
              Change
            </Button>
          </div>
        ) : (
          <DrugPicker onPick={pick} />
        )}

        {drug && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <TextField
                label="Dose"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                error={amount && !amountOk ? 'More than 0' : undefined}
              />
              <SelectField
                label="Unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                options={DOSE_UNITS.map((u) => ({ value: u, label: u }))}
              />
              <SelectField
                label="Route"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                options={ROUTES.map((r) => ({
                  value: r,
                  label: ROUTE_LABEL[r] ?? r,
                }))}
              />
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={asNeeded}
                  onChange={(e) => setAsNeeded(e.target.checked)}
                />
                As needed
              </label>
              {!asNeeded && (
                <TextField
                  label="Every (hours)"
                  type="number"
                  min="1"
                  max="168"
                  value={intervalHours}
                  onChange={(e) => setIntervalHours(e.target.value)}
                  error={!intervalOk ? '1 to 168 hours' : undefined}
                />
              )}
            </div>
            <TextAreaField
              label="Instructions (optional)"
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              hint="e.g. With meals, or If temperature > 38.5 °C"
            />
          </>
        )}

        {blocking.length > 0 && (
          <div
            role="alert"
            className="space-y-2 rounded-md border-2 border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            <strong>Stopped by a safety check</strong>
            <ul className="list-disc pl-5">
              {blocking.map((b) => (
                <li key={b.code}>{b.message}</li>
              ))}
            </ul>
            <TextAreaField
              label="Prescribe anyway? Write why (it is recorded)"
              rows={2}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
            />
          </div>
        )}
        {warnings.length > 0 && (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Check before prescribing</strong>
            <ul className="list-disc pl-5">
              {warnings.map((w) => (
                <li key={w.code}>{w.message}</li>
              ))}
            </ul>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              I have checked these
            </label>
          </div>
        )}
        {otherError && <Alert>{otherError}</Alert>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            className={blocking.length ? 'bg-red-700 hover:bg-red-800' : ''}
            onClick={submit}
          >
            {blocking.length ? 'Prescribe anyway' : 'Prescribe'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DrugPicker({ onPick }: { onPick: (d: CatalogMedication) => void }) {
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), 250);
  const results = useMedicationCatalog(q);
  return (
    <div className="space-y-2">
      <label
        htmlFor="drug-search"
        className="block text-sm font-medium text-slate-700"
      >
        Drug
      </label>
      <input
        id="drug-search"
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Name, active ingredient or ATC code"
        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 focus:outline-none"
      />
      {q.length >= 2 && (
        <QueryState
          query={results}
          isEmpty={(r) => r.length === 0}
          empty="Not in the catalog."
        >
          {(items) => (
            <ul
              aria-label="Drugs"
              className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200"
            >
              {items.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => onPick(d)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-teal-50 focus:bg-teal-50 focus:outline-none"
                  >
                    <span className="font-medium">{d.name}</span> {d.strength}{' '}
                    {d.form}{' '}
                    <span className="font-mono text-xs text-slate-500">
                      {d.atcCode}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      )}
    </div>
  );
}
