import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/Button';
import { ReasonDialog } from '@/components/ReasonDialog';
import { Badge, QueryState } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { StaffName } from '@/features/staff/StaffName';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, timeAgo } from '@/lib/format';
import {
  doseText,
  formatAmount,
  useAdministrations,
  useMedicationActions,
  usePrescriptions,
} from './api';
import type { Prescription } from './api';
import { PrescribeDialog } from './PrescribeDialog';
import { RecordDoseDialog } from './RecordDoseDialog';
import { t } from '@/i18n';

const MED_ERRORS = {
  get prescription_not_active() {
    return t('med.rNotActive');
  },
  get only_the_prescriber_can_void() {
    return t('med.rOnlyPrescriber');
  },
  get doses_already_given() {
    return t('med.rDosesGiven');
  },
};

/**
 * The patient's current medication with what each role can do:
 * doctor: prescribe (needs an open visit), stop, mark as error (own, nothing given yet)
 * nurse (and doctor): record a dose; everyone: dose history.
 */
export function MedicationList({
  patientId,
  patientLabel,
  openEncounterId,
}: {
  patientId: string;
  patientLabel: string;
  /** the visit new prescriptions go into; no open visit = no "Prescribe" */
  openEncounterId?: string;
}) {
  const { state } = useAuth();
  const me = state.user!;
  const prescriptions = usePrescriptions(patientId);
  const [prescribing, setPrescribing] = useState(false);

  return (
    <div className="space-y-3">
      {me.role === 'doctor' &&
        (openEncounterId ? (
          <Button variant="secondary" onClick={() => setPrescribing(true)}>
            {t('med.prescribe')}
          </Button>
        ) : (
          <p className="text-xs text-slate-500">{t('med.startVisitFirst')}</p>
        ))}
      <QueryState
        query={prescriptions}
        isEmpty={(p) => p.length === 0}
        empty={t('med.noActive')}
      >
        {(items) => (
          <ul className="divide-y divide-slate-100">
            {items.map((rx) => (
              <PrescriptionItem
                key={rx.id}
                rx={rx}
                patientId={patientId}
                patientLabel={patientLabel}
                me={me}
              />
            ))}
          </ul>
        )}
      </QueryState>
      {prescribing && openEncounterId && (
        <PrescribeDialog
          patientId={patientId}
          encounterId={openEncounterId}
          onClose={() => setPrescribing(false)}
        />
      )}
    </div>
  );
}

function PrescriptionItem({
  rx,
  patientId,
  patientLabel,
  me,
}: {
  rx: Prescription;
  patientId: string;
  patientLabel: string;
  me: { id: string; role: string };
}) {
  const actions = useMedicationActions(patientId);
  const toast = useToast();
  const [dialog, setDialog] = useState<'dose' | 'stop' | 'error' | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const isDoctor = me.role === 'doctor';
  const canGive = me.role === 'nurse' || isDoctor;

  return (
    <li className="py-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">
            {rx.medication.name} {rx.medication.strength}
          </div>
          <div className="text-slate-600">{doseText(rx)}</div>
          {rx.instructions && (
            <div className="text-slate-500 italic">{rx.instructions}</div>
          )}
          {rx.overrideReason && (
            <div className="mt-1">
              <Badge tone="red">{t('med.allergyOverride')}</Badge>{' '}
              <span className="text-xs text-slate-500">
                {rx.overrideReason}
              </span>
            </div>
          )}
          <div className="text-xs text-slate-400">
            {rx.lastGivenAt
              ? t('med.lastGiven', { ago: timeAgo(rx.lastGivenAt) })
              : t('med.notGiven')}{' '}
            · <StaffName id={rx.prescribedBy} />
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {canGive && (
          <Button
            // giving doses is the nurse's main job here; for a doctor it's a secondary action
            variant={me.role === 'nurse' ? 'primary' : 'secondary'}
            className="py-1"
            onClick={() => setDialog('dose')}
          >
            {t('med.recordDose')}
          </Button>
        )}
        <Button
          variant="ghost"
          className="py-1"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
        >
          {showHistory ? t('med.hideHistory') : t('med.history')}
        </Button>
        {isDoctor && (
          <Button
            variant="ghost"
            className="py-1"
            onClick={() => setDialog('stop')}
          >
            {t('med.stop')}
          </Button>
        )}
        {isDoctor && rx.prescribedBy === me.id && (
          <Button
            variant="ghost"
            className="py-1 text-red-700"
            onClick={() => setDialog('error')}
          >
            {t('med.markError')}
          </Button>
        )}
      </div>
      {showHistory && (
        <DoseHistory patientId={patientId} prescriptionId={rx.id} />
      )}

      {dialog === 'dose' && (
        <RecordDoseDialog
          patientId={patientId}
          patientLabel={patientLabel}
          prescription={rx}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'stop' && (
        <ReasonDialog
          title={t('med.stopQ', { name: rx.medication.name })}
          confirmLabel={t('med.stop')}
          pending={actions.stop.isPending}
          error={
            actions.stop.error
              ? errorMessage(actions.stop.error, MED_ERRORS)
              : null
          }
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            actions.stop.mutate(
              { id: rx.id, reason },
              {
                onSuccess: () => {
                  toast(t('med.stopped', { name: rx.medication.name }));
                  setDialog(null);
                },
              },
            )
          }
        >
          {t('med.stopText')}
        </ReasonDialog>
      )}
      {dialog === 'error' && (
        <ReasonDialog
          title={t('med.markTitle')}
          confirmLabel={t('med.markError')}
          danger
          pending={actions.markError.isPending}
          error={
            actions.markError.error
              ? errorMessage(actions.markError.error, MED_ERRORS)
              : null
          }
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            actions.markError.mutate(
              { id: rx.id, reason },
              {
                onSuccess: () => {
                  toast(t('med.marked'));
                  setDialog(null);
                },
              },
            )
          }
        >
          {t('med.markText')}
        </ReasonDialog>
      )}
    </li>
  );
}

const DOSE_BADGE = {
  given: {
    get label() {
      return t('med.given');
    },
    tone: 'green',
  },
  skipped: {
    get label() {
      return t('med.skipped');
    },
    tone: 'amber',
  },
  refused: {
    get label() {
      return t('med.refused');
    },
    tone: 'amber',
  },
} as const;

function DoseHistory({
  patientId,
  prescriptionId,
}: {
  patientId: string;
  prescriptionId: string;
}) {
  const doses = useAdministrations(patientId, prescriptionId, true);
  return (
    <div className="mt-2 rounded-md bg-slate-50 p-2">
      <QueryState
        query={doses}
        isEmpty={(d) => d.length === 0}
        empty={t('med.noDoses')}
      >
        {(items) => (
          <ul className="space-y-1 text-xs">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={DOSE_BADGE[a.status].tone}>
                  {DOSE_BADGE[a.status].label}
                </Badge>
                <span>{formatDateTime(a.administeredAt)}</span>
                {a.doseAmount && (
                  <span>
                    {formatAmount(a.doseAmount)} {a.doseUnit}
                  </span>
                )}
                <span className="text-slate-500">
                  <StaffName id={a.administeredBy} />
                </span>
                {a.note && (
                  <span className="text-slate-500 italic">"{a.note}"</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
