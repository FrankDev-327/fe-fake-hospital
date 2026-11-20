import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { Badge, ErrorMessage, Loading } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { usePatient } from '@/features/patients/api';
import { StaffName } from '@/features/staff/StaffName';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, patientName } from '@/lib/format';
import {
  ENCOUNTER_STATUS,
  ENCOUNTER_TYPE_LABEL,
  useCloseEncounter,
  useEncounter,
} from './api';
import { OrderLabDialog } from '@/features/lab/OrderLabDialog';
import { MedicationList } from '@/features/medication/MedicationList';
import { RecordVitalsDialog } from '@/features/vitals/RecordVitalsDialog';
import { DiagnosesSection } from './DiagnosesSection';
import { NotesSection } from './NotesSection';

const route = getRouteApi('/app/patients/$patientId/visits/$encounterId');

/** One visit: what happened (notes) and what the patient has (diagnoses). */
export function EncounterPage() {
  const { patientId, encounterId } = route.useParams();
  const { state } = useAuth();
  const me = state.user!;
  const patient = usePatient(patientId);
  const encounter = useEncounter(patientId, encounterId);
  const [closing, setClosing] = useState<'finish' | 'cancel' | null>(null);
  const [dialog, setDialog] = useState<'vitals' | 'lab' | null>(null);

  if (encounter.isPending) return <Loading />;
  if (encounter.error) return <ErrorMessage error={encounter.error} />;
  const e = encounter.data;
  const open = e.status === 'in_progress';
  const isDoctor = me.role === 'doctor';

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link
          to="/patients/$patientId"
          params={{ patientId }}
          className="text-teal-700 hover:underline"
        >
          {patient.data ? patientName(patient.data) : 'Patient'}
        </Link>{' '}
        › Visit
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white px-5 py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">
              {ENCOUNTER_TYPE_LABEL[e.type]} visit
            </h1>
            <Badge tone={ENCOUNTER_STATUS[e.status].tone}>
              {ENCOUNTER_STATUS[e.status].label}
            </Badge>
          </div>
          {e.reason && <p className="text-slate-700">{e.reason}</p>}
          <p className="text-sm text-slate-500">
            <StaffName id={e.doctorId} /> · started{' '}
            {formatDateTime(e.startedAt)}
            {e.endedAt && ` · ended ${formatDateTime(e.endedAt)}`}
          </p>
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDialog('vitals')}>
              Record vitals
            </Button>
            {isDoctor && (
              <>
                <Button variant="secondary" onClick={() => setDialog('lab')}>
                  Order lab tests
                </Button>
                <Button onClick={() => setClosing('finish')}>
                  Finish visit
                </Button>
                <Button variant="ghost" onClick={() => setClosing('cancel')}>
                  Cancel visit
                </Button>
              </>
            )}
          </div>
        )}
      </header>

      {!open && (
        <Alert tone="info">
          This visit is {e.status === 'finished' ? 'finished' : 'cancelled'}.
          Notes can still be corrected (amend) and diagnoses updated, but
          nothing new can be added.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NotesSection
            patientId={patientId}
            encounterId={encounterId}
            open={open}
            me={me}
          />
        </div>
        <div className="space-y-6">
          <DiagnosesSection
            patientId={patientId}
            encounterId={encounterId}
            open={open}
            canDiagnose={isDoctor}
          />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Medication</h2>
            <MedicationList
              patientId={patientId}
              patientLabel={patient.data ? patientName(patient.data) : ''}
              openEncounterId={open ? encounterId : undefined}
            />
          </section>
        </div>
      </div>

      {dialog === 'vitals' && (
        <RecordVitalsDialog
          patientId={patientId}
          encounterId={encounterId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'lab' && (
        <OrderLabDialog
          patientId={patientId}
          encounterId={encounterId}
          onClose={() => setDialog(null)}
        />
      )}
      {closing && (
        <CloseVisitDialog
          patientId={patientId}
          encounterId={encounterId}
          action={closing}
          onClose={() => setClosing(null)}
        />
      )}
    </div>
  );
}

function CloseVisitDialog({
  patientId,
  encounterId,
  action,
  onClose,
}: {
  patientId: string;
  encounterId: string;
  action: 'finish' | 'cancel';
  onClose: () => void;
}) {
  const close = useCloseEncounter(patientId, encounterId, action);
  const toast = useToast();
  const body = (
    close.error instanceof ApiError ? close.error.body : undefined
  ) as { drafts?: number } | undefined;
  return (
    <Modal
      title={action === 'finish' ? 'Finish this visit?' : 'Cancel this visit?'}
      onClose={onClose}
    >
      <p className="mb-4 text-sm text-slate-600">
        {action === 'finish'
          ? 'All notes must be signed. After finishing, nothing new can be added to this visit.'
          : 'Only for a visit opened by mistake: possible while nothing was signed or diagnosed in it.'}
      </p>
      {close.error && (
        <div className="mb-4">
          <Alert>
            {errorMessage(close.error, {
              unsigned_notes: `There ${body?.drafts === 1 ? 'is 1 unsigned note' : `are ${body?.drafts} unsigned notes`}. Sign or discard ${body?.drafts === 1 ? 'it' : 'them'} first.`,
              encounter_has_records:
                'This visit already has signed notes or diagnoses: finish it instead.',
              encounter_closed: 'The visit is already closed.',
            })}
          </Alert>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Back
        </Button>
        <Button
          disabled={close.isPending}
          className={action === 'cancel' ? 'bg-red-700 hover:bg-red-800' : ''}
          onClick={() =>
            close.mutate(undefined, {
              onSuccess: () => {
                toast(
                  action === 'finish' ? 'Visit finished' : 'Visit cancelled',
                );
                onClose();
              },
            })
          }
        >
          {action === 'finish' ? 'Finish visit' : 'Cancel visit'}
        </Button>
      </div>
    </Modal>
  );
}
