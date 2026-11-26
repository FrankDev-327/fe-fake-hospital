import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { SelectField, TextAreaField } from '@/components/fields';
import { Modal } from '@/components/Modal';
import { Badge, Card, QueryState } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import {
  ENCOUNTER_STATUS,
  ENCOUNTER_TYPE_LABEL,
  useEncounters,
  useStartEncounter,
} from './api';
import { t, zmsg } from '@/i18n';

/** The patient's visits, newest first. Doctors can start a new one. */
export function VisitsCard({
  patientId,
  canStart,
}: {
  patientId: string;
  canStart: boolean;
}) {
  const encounters = useEncounters(patientId);
  const [starting, setStarting] = useState(false);
  return (
    <Card
      title={
        <span className="flex items-center justify-between">
          {t('clinical.visits')}
          {canStart && (
            <Button className="py-1" onClick={() => setStarting(true)}>
              {t('clinical.startVisit')}
            </Button>
          )}
        </span>
      }
    >
      <QueryState
        query={encounters}
        isEmpty={(e) => e.length === 0}
        empty={t('clinical.noVisits')}
      >
        {(items) => (
          <ul className="divide-y divide-slate-100 text-sm">
            {items.map((e) => (
              <li key={e.id}>
                <Link
                  to="/patients/$patientId/visits/$encounterId"
                  params={{ patientId, encounterId: e.id }}
                  className="-mx-2 flex items-center gap-3 rounded px-2 py-2 hover:bg-slate-50"
                >
                  <Badge tone={ENCOUNTER_STATUS[e.status].tone}>
                    {ENCOUNTER_STATUS[e.status].label}
                  </Badge>
                  <span className="flex-1">
                    <span className="font-medium text-teal-800">
                      {ENCOUNTER_TYPE_LABEL[e.type]}
                    </span>
                    {e.reason && (
                      <span className="text-slate-600"> · {e.reason}</span>
                    )}
                  </span>
                  <span className="text-xs whitespace-nowrap text-slate-500">
                    {formatDateTime(e.startedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      {starting && (
        <StartVisitDialog
          patientId={patientId}
          onClose={() => setStarting(false)}
        />
      )}
    </Card>
  );
}

const StartVisitForm = z.object({
  type: z.enum(['outpatient', 'emergency', 'inpatient']),
  reason: z
    .string()
    .trim()
    .max(2000)
    .refine((r) => r === '' || r.length >= 2, zmsg('clinical.min2')),
});
type StartVisitForm = z.infer<typeof StartVisitForm>;

const typeOptions = () =>
  Object.entries(ENCOUNTER_TYPE_LABEL).map(([value, label]) => ({
    value,
    label,
  }));

function StartVisitDialog({
  patientId,
  onClose,
}: {
  patientId: string;
  onClose: () => void;
}) {
  const start = useStartEncounter(patientId);
  const navigate = useNavigate();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StartVisitForm>({
    resolver: zodResolver(StartVisitForm),
    defaultValues: { type: 'outpatient', reason: '' },
  });

  return (
    <Modal title={t('clinical.startVisit')} onClose={onClose}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (v) => {
          const encounter = await start
            .mutateAsync({ type: v.type, reason: v.reason.trim() || null })
            .catch(() => null);
          if (!encounter) return;
          toast(t('clinical.visitStarted'));
          await navigate({
            to: '/patients/$patientId/visits/$encounterId',
            params: { patientId, encounterId: encounter.id },
          });
        })}
      >
        {start.error && <Alert>{errorMessage(start.error)}</Alert>}
        <SelectField
          label={t('clinical.type')}
          options={typeOptions()}
          {...register('type')}
        />
        <TextAreaField
          label={t('clinical.reasonVisit')}
          rows={3}
          hint={t('clinical.reasonVisitHint')}
          error={errors.reason?.message}
          {...register('reason')}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {t('clinical.startVisit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
