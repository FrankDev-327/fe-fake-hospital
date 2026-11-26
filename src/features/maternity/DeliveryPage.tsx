import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ReasonDialog } from '@/components/ReasonDialog';
import { useToast } from '@/components/toast-context';
import { Badge, Card, Loading, ErrorMessage } from '@/components/ui';
import { usePatient } from '@/features/patients/api';
import { StaffName } from '@/features/staff/StaffName';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, patientName, timeAgo } from '@/lib/format';
import {
  BIRTH_STATUS,
  DELIVERY_STATUS,
  SEX_OPTIONS,
  STEP_LABEL,
  useDelivery,
  useDeliveryActions,
} from './api';
import type { Birth, Delivery } from './api';
import { RegisterBirthDialog } from './RegisterBirthDialog';
import { t } from '@/i18n';

const route = getRouteApi('/app/maternity/$deliveryId');

export function DeliveryPage() {
  const { deliveryId } = route.useParams();
  const delivery = useDelivery(deliveryId);
  const [dialog, setDialog] = useState<'birth' | 'cancel' | null>(null);
  const { cancel } = useDeliveryActions();
  const toast = useToast();

  if (delivery.isPending) return <Loading />;
  if (delivery.error) return <ErrorMessage error={delivery.error} />;
  const d = delivery.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white px-5 py-4">
        <h1 className="text-2xl font-semibold">
          <MotherName id={d.motherPatientId} />
        </h1>
        <Badge tone={DELIVERY_STATUS[d.status].tone}>
          {DELIVERY_STATUS[d.status].label}
        </Badge>
        <span className="text-sm text-slate-600">
          {t('mat.startedBy', {
            at: formatDateTime(d.startedAt),
            ago: timeAgo(d.startedAt),
          })}{' '}
          <StaffName id={d.startedBy} />
        </span>
        <div className="ml-auto flex gap-2">
          {d.status !== 'cancelled' && (
            <Button onClick={() => setDialog('birth')}>
              {d.births.length
                ? t('mat.registerAnother')
                : t('mat.registerBirth')}
            </Button>
          )}
          {d.status === 'in_labor' && (
            <Button variant="secondary" onClick={() => setDialog('cancel')}>
              {t('mat.falseAlarm')}
            </Button>
          )}
        </div>
      </header>

      {d.status === 'cancelled' && (
        <Alert>
          {t('mat.cancelledAt', {
            at: d.cancelledAt ? formatDateTime(d.cancelledAt) : '',
            reason: d.cancelReason,
          })}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {d.births.length === 0 ? (
            <Card title={t('mat.babies')}>
              <p className="text-sm text-slate-500">{t('mat.noBaby')}</p>
            </Card>
          ) : (
            d.births.map((b) => <BirthCard key={b.babyPatientId} d={d} b={b} />)
          )}
        </div>
        <TeamCard d={d} />
      </div>

      {dialog === 'birth' && (
        <RegisterBirthDialog delivery={d} onClose={() => setDialog(null)} />
      )}
      {dialog === 'cancel' && (
        <ReasonDialog
          title={t('mat.falseAlarm')}
          confirmLabel={t('mat.cancelLabor')}
          danger
          pending={cancel.isPending}
          error={
            cancel.error &&
            errorMessage(cancel.error, {
              not_in_labor: 'A baby was already born: it can’t be cancelled.',
            })
          }
          onConfirm={(reason) =>
            cancel.mutate(
              { id: d.id, reason },
              {
                onSuccess: () => {
                  toast(t('mat.laborCancelled'));
                  setDialog(null);
                },
              },
            )
          }
          onClose={() => setDialog(null)}
        >
          {t('mat.cancelText')}
        </ReasonDialog>
      )}
    </div>
  );
}

function MotherName({ id }: { id: string }) {
  const mother = usePatient(id);
  return (
    <Link
      to="/patients/$patientId"
      params={{ patientId: id }}
      className="hover:underline"
    >
      {mother.data ? patientName(mother.data) : 'Mother'}
    </Link>
  );
}

const sexLabel = (sex: Birth['sex']) =>
  SEX_OPTIONS.find((o) => o.value === sex)!.label;

function BirthCard({ d, b }: { d: Delivery; b: Birth }) {
  const { retry } = useDeliveryActions();
  return (
    <Card
      title={
        <span className="flex items-center justify-between">
          <span>
            {t('mat.babyTitle', {
              label: b.label,
              sex: sexLabel(b.sex),
              at: formatDateTime(b.bornAt),
            })}
          </span>
          <Badge tone={BIRTH_STATUS[b.status].tone}>
            {BIRTH_STATUS[b.status].label}
          </Badge>
        </span>
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          {t('mat.primaryDoctor')} <StaffName id={b.primaryDoctorId} />
        </p>
        {/* the saga's steps: the baby's chart opens once all three are done */}
        <ol className="flex flex-wrap gap-2" aria-label={t('mat.steps')}>
          {b.steps.map((s) => (
            <li key={s.step}>
              <Badge
                tone={
                  s.status === 'done'
                    ? 'green'
                    : s.status === 'pending'
                      ? 'gray'
                      : 'red'
                }
              >
                {s.status === 'done' ? '✓ ' : ''}
                {STEP_LABEL[s.step]}
              </Badge>
            </li>
          ))}
        </ol>
        {b.status === 'ready' && (
          <Link
            to="/patients/$patientId"
            params={{ patientId: b.babyPatientId }}
            className="inline-block font-medium text-teal-800 hover:underline"
          >
            {t('mat.openChart', { label: b.label })}
          </Link>
        )}
        {b.status === 'failed' && (
          <div className="space-y-2">
            <Alert>
              {t('mat.failed', { detail: b.failure ? `: ${b.failure}` : '' })}
            </Alert>
            <Button
              variant="secondary"
              disabled={retry.isPending}
              onClick={() =>
                retry.mutate({ id: d.id, babyPatientId: b.babyPatientId })
              }
            >
              {t('mat.retry')}
            </Button>
            {retry.error && (
              <Alert>
                {errorMessage(retry.error, {
                  nothing_to_retry: t('mat.nothingRetry'),
                })}
              </Alert>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Who helped: a legal record (append-only in the backend). */
function TeamCard({ d }: { d: Delivery }) {
  return (
    <Card title={t('mat.team')}>
      {d.team.length === 0 ? (
        <p className="text-sm text-slate-500">{t('mat.teamLater')}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {d.team.map((m) => (
            <li key={m.staffId} className="flex justify-between gap-2">
              <StaffName id={m.staffId} />
              <Badge tone={m.role === 'doctor' ? 'blue' : 'teal'}>
                {m.role === 'doctor' ? t('mat.doctor') : t('mat.nurse')}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500">{t('mat.teamHour')}</p>
    </Card>
  );
}
