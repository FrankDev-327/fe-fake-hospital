import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import {
  Badge,
  Loading,
  PageHeader,
  QueryState,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { useMyPatients } from '@/features/patients/api';
import type { PatientSummary } from '@/features/patients/api';
import { Button } from '@/components/Button';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useNow } from '@/hooks/useNow';
import { dueLabel, formatDateTime, patientName, timeAgo } from '@/lib/format';
import {
  doseText,
  nextDue,
  useMedicationCatalog,
  usePrescriptionsFor,
} from './api';
import type { Prescription } from './api';
import { RecordDoseDialog } from './RecordDoseDialog';

export function MedicationPage() {
  const { state } = useAuth();
  return state.user?.role === 'pharmacist' ? (
    <DrugCatalog />
  ) : (
    <MedicationRound />
  );
}

/** Nurse: every active prescription of my patients, what's due first on top. */
function MedicationRound() {
  const patients = useMyPatients();
  const list = patients.data ?? [];
  const results = usePrescriptionsFor(list.map((p) => p.id));
  const now = useNow(); // hooks go before any early return
  const [recording, setRecording] = useState<{
    rx: Prescription;
    patient: PatientSummary;
  } | null>(null);

  if (patients.isPending || results.some((r) => r.isPending))
    return <Loading />;

  const rows = list
    .flatMap((patient, i) =>
      (results[i]?.data ?? []).map((rx) => ({ patient, rx, due: nextDue(rx) })),
    )
    // scheduled doses by due time, "as needed" at the end
    .sort(
      (a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity),
    );

  return (
    <>
      <PageHeader
        title="Medication round"
        subtitle="Active prescriptions of your patients"
      />
      <Table>
        <thead>
          <tr>
            <Th>Due</Th>
            <Th>Patient</Th>
            <Th>Medication</Th>
            <Th>Dose</Th>
            <Th>Last given</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ patient, rx, due }) => {
            const overdue = due && due.getTime() < now;
            return (
              <tr key={rx.id}>
                <Td>
                  {!due ? (
                    <Badge>As needed</Badge>
                  ) : overdue ? (
                    <Badge tone="red">
                      Overdue {timeAgo(due.toISOString(), now)}
                    </Badge>
                  ) : (
                    <Badge tone="blue">{dueLabel(due, now)}</Badge>
                  )}
                </Td>
                <Td>
                  <Link
                    to="/patients/$patientId"
                    params={{ patientId: patient.id }}
                    className="font-medium text-teal-800 hover:underline"
                  >
                    {patientName(patient)}
                  </Link>
                </Td>
                <Td>
                  {rx.medication.name} {rx.medication.strength}
                  {rx.instructions && (
                    <div className="text-xs text-slate-500 italic">
                      {rx.instructions}
                    </div>
                  )}
                </Td>
                <Td>{doseText(rx)}</Td>
                <Td className="text-slate-500">
                  {rx.lastGivenAt ? formatDateTime(rx.lastGivenAt) : '—'}
                </Td>
                <Td>
                  <Button
                    className="py-1"
                    aria-label={`Record ${rx.medication.name} for ${patientName(patient)}`}
                    onClick={() => setRecording({ rx, patient })}
                  >
                    Record
                  </Button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {recording && (
        <RecordDoseDialog
          patientId={recording.patient.id}
          patientLabel={patientName(recording.patient)}
          prescription={recording.rx}
          onClose={() => setRecording(null)}
        />
      )}
    </>
  );
}

/** Pharmacist: look up a drug in the hospital catalog. */
function DrugCatalog() {
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim());
  const results = useMedicationCatalog(q);
  return (
    <>
      <PageHeader
        title="Drug catalog"
        subtitle="Search by name, active ingredient or ATC code"
      />
      <input
        type="search"
        aria-label="Search drugs"
        placeholder="e.g. paracetamol or N02"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        className="mb-4 w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 focus:outline-none"
      />
      {q.length < 2 ? (
        <p className="text-sm text-slate-500">Type at least 2 characters.</p>
      ) : (
        <QueryState
          query={results}
          isEmpty={(r) => r.length === 0}
          empty="Nothing found."
        >
          {(items) => (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Active ingredient</Th>
                  <Th>ATC</Th>
                  <Th>Form</Th>
                  <Th>Strength</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id}>
                    <Td className="font-medium">{m.name}</Td>
                    <Td>{m.activeIngredient}</Td>
                    <Td className="font-mono text-xs">{m.atcCode}</Td>
                    <Td>{m.form}</Td>
                    <Td>{m.strength}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </QueryState>
      )}
    </>
  );
}
