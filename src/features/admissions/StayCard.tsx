import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/toast-context';
import { Badge, Card, QueryState } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { useOpenEncounter } from '@/features/clinical/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, timeAgo } from '@/lib/format';
import { currentStay, useAdmissionActions, useAdmissions } from './api';
import type { Admission, DischargeStep } from './api';
import { BedDialog } from './BedDialog';
import { t } from '@/i18n';

const STEP_TONE: Record<DischargeStep['status'], BadgeTone> = {
  waiting: 'gray',
  pending: 'blue',
  done: 'green',
  failed: 'red',
  timed_out: 'red',
};

/**
 * Where the patient lies now (ward, room, bed) with Move and Discharge, the discharge's steps
 * while it runs (Retry / Abort when one got stuck), or Admit when there's an open hospital
 * visit but no bed yet. Earlier stays below.
 */
export function StayCard({
  patientId,
  canDischarge,
}: {
  patientId: string;
  /** only doctors discharge */
  canDischarge: boolean;
}) {
  const admissions = useAdmissions(patientId);
  const openVisit = useOpenEncounter(patientId);
  const [dialog, setDialog] = useState<'admit' | 'move' | 'discharge' | null>(
    null,
  );
  const stay = currentStay(admissions.data);
  const canAdmit = !stay && openVisit?.type === 'inpatient';

  return (
    <Card
      title={
        <span className="flex items-center justify-between">
          {t('adm.stay')}
          {canAdmit && (
            <Button className="py-1" onClick={() => setDialog('admit')}>
              {t('adm.admit')}
            </Button>
          )}
        </span>
      }
    >
      <QueryState query={admissions}>
        {(items) => (
          <div className="space-y-3 text-sm">
            {stay ? (
              <Current
                stay={stay}
                canDischarge={canDischarge}
                onMove={() => setDialog('move')}
                onDischarge={() => setDialog('discharge')}
              />
            ) : (
              <p className="text-slate-500">
                {canAdmit ? t('adm.waiting') : t('adm.notAdmitted')}
              </p>
            )}
            <History items={items.filter((a) => a.status === 'discharged')} />
          </div>
        )}
      </QueryState>

      {dialog === 'admit' && openVisit && (
        <BedDialog
          mode="admit"
          patientId={patientId}
          encounterId={openVisit.id}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'move' && stay && (
        <BedDialog
          mode="transfer"
          patientId={patientId}
          admissionId={stay.id}
          currentBedId={stay.bed?.bedId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'discharge' && stay && (
        <DischargeDialog stay={stay} onClose={() => setDialog(null)} />
      )}
    </Card>
  );
}

function Current({
  stay,
  canDischarge,
  onMove,
  onDischarge,
}: {
  stay: Admission;
  canDischarge: boolean;
  onMove: () => void;
  onDischarge: () => void;
}) {
  const toast = useToast();
  const { retry, abort } = useAdmissionActions(stay.patientId);
  const d = stay.discharge;
  const stuck = d?.steps.some(
    (s) => s.status === 'timed_out' || s.status === 'failed',
  );
  const visitClosed = d?.steps.some(
    (s) => s.step === 'close_encounter' && s.status === 'done',
  );
  const failed = retry.error ?? abort.error;

  return (
    <div className="space-y-3">
      <div>
        <div className="text-base font-medium">
          {stay.bed
            ? t('adm.where', {
                ward: stay.bed.ward.name,
                room: stay.bed.room,
                bed: stay.bed.bed,
              })
            : '—'}
        </div>
        <div className="text-slate-500">
          {t('adm.since', {
            at: formatDateTime(stay.admittedAt),
            ago: timeAgo(stay.admittedAt),
          })}
        </div>
      </div>

      {stay.status === 'active' && (
        <div className="flex gap-2">
          <Button variant="secondary" className="py-1" onClick={onMove}>
            {t('adm.move')}
          </Button>
          {canDischarge && (
            <Button variant="secondary" className="py-1" onClick={onDischarge}>
              {t('adm.discharge')}
            </Button>
          )}
        </div>
      )}

      {d && (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="font-medium">{t('adm.discharging')}</div>
          <ol className="space-y-1">
            {d.steps.map((s) => (
              <li key={s.step} className="flex items-center justify-between">
                <span>{t(`adm.step.${s.step}`)}</span>
                <Badge tone={STEP_TONE[s.status]}>
                  {t(`adm.stepStatus.${s.status}`)}
                </Badge>
              </li>
            ))}
          </ol>
          {d.failure && <Alert>{d.failure}</Alert>}
          {failed && <Alert>{errorMessage(failed)}</Alert>}
          {stuck && canDischarge && (
            <div className="flex gap-2">
              <Button
                className="py-1"
                disabled={retry.isPending}
                onClick={() =>
                  retry.mutate(stay.id, {
                    onSuccess: () => toast(t('adm.retrying')),
                  })
                }
              >
                {t('adm.retry')}
              </Button>
              {!visitClosed && (
                <Button
                  variant="secondary"
                  className="py-1"
                  disabled={abort.isPending}
                  onClick={() =>
                    abort.mutate(stay.id, {
                      onSuccess: () => toast(t('adm.aborted')),
                    })
                  }
                >
                  {t('adm.abort')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function History({ items }: { items: Admission[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {t('adm.earlier')}
      </div>
      <ul className="space-y-1 text-slate-600">
        {items.slice(0, 5).map((a) => (
          <li key={a.id}>
            {t('adm.earlierRow', {
              from: formatDateTime(a.admittedAt),
              to: a.dischargedAt ? formatDateTime(a.dischargedAt) : '?',
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DischargeDialog({
  stay,
  onClose,
}: {
  stay: Admission;
  onClose: () => void;
}) {
  const { discharge } = useAdmissionActions(stay.patientId);
  return (
    <Modal title={t('adm.dischargeTitle')} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p>{t('adm.dischargeText')}</p>
        {discharge.error && (
          <Alert>
            {errorMessage(discharge.error, {
              admission_not_active: t('adm.errNotActive'),
            })}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={discharge.isPending}
            onClick={() => discharge.mutate(stay.id, { onSuccess: onClose })}
          >
            {t('adm.discharge')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
