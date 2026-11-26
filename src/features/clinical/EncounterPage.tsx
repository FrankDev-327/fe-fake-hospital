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
import { t } from '@/i18n';

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
              {t('clinical.visitTitle', { type: ENCOUNTER_TYPE_LABEL[e.type] })}
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
              {t('clinical.recordVitals')}
            </Button>
            {isDoctor && (
              <>
                <Button variant="secondary" onClick={() => setDialog('lab')}>
                  {t('lab.order')}
                </Button>
                <Button onClick={() => setClosing('finish')}>
                  {t('clinical.finishVisit')}
                </Button>
                <Button variant="ghost" onClick={() => setClosing('cancel')}>
                  {t('clinical.cancelVisit')}
                </Button>
              </>
            )}
          </div>
        )}
      </header>

      {!open && (
        <Alert tone="info">
          {e.status === 'finished'
            ? t('clinical.closedFinished')
            : t('clinical.closedCancelled')}
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
            <h2 className="text-lg font-semibold">
              {t('clinical.medication')}
            </h2>
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
      title={
        action === 'finish' ? t('clinical.finishQ') : t('clinical.cancelQ')
      }
      onClose={onClose}
    >
      <p className="mb-4 text-sm text-slate-600">
        {action === 'finish'
          ? t('clinical.finishText')
          : t('clinical.cancelText')}
      </p>
      {close.error && (
        <div className="mb-4">
          <Alert>
            {errorMessage(close.error, {
              unsigned_notes: t(
                body?.drafts === 1
                  ? 'clinical.unsigned_one'
                  : 'clinical.unsigned_other',
                { count: body?.drafts },
              ),
              encounter_has_records: t('clinical.hasRecords'),
              encounter_closed: t('clinical.alreadyClosed'),
            })}
          </Alert>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('common.back')}
        </Button>
        <Button
          disabled={close.isPending}
          className={action === 'cancel' ? 'bg-red-700 hover:bg-red-800' : ''}
          onClick={() =>
            close.mutate(undefined, {
              onSuccess: () => {
                toast(
                  action === 'finish'
                    ? t('clinical.visitFinished')
                    : t('clinical.visitCancelled'),
                );
                onClose();
              },
            })
          }
        >
          {action === 'finish'
            ? t('clinical.finishVisit')
            : t('clinical.cancelVisit')}
        </Button>
      </div>
    </Modal>
  );
}
