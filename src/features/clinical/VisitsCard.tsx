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
          Visits
          {canStart && (
            <Button className="py-1" onClick={() => setStarting(true)}>
              Start visit
            </Button>
          )}
        </span>
      }
    >
      <QueryState
        query={encounters}
        isEmpty={(e) => e.length === 0}
        empty="No visits yet."
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
    .refine((r) => r === '' || r.length >= 2, 'At least 2 characters'),
});
type StartVisitForm = z.infer<typeof StartVisitForm>;

const TYPE_OPTIONS = Object.entries(ENCOUNTER_TYPE_LABEL).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

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
    <Modal title="Start visit" onClose={onClose}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (v) => {
          const encounter = await start
            .mutateAsync({ type: v.type, reason: v.reason.trim() || null })
            .catch(() => null);
          if (!encounter) return;
          toast('Visit started');
          await navigate({
            to: '/patients/$patientId/visits/$encounterId',
            params: { patientId, encounterId: encounter.id },
          });
        })}
      >
        {start.error && <Alert>{errorMessage(start.error)}</Alert>}
        <SelectField
          label="Type"
          options={TYPE_OPTIONS}
          {...register('type')}
        />
        <TextAreaField
          label="Reason for the visit"
          rows={3}
          hint="What brings the patient in (optional)"
          error={errors.reason?.message}
          {...register('reason')}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            Start visit
          </Button>
        </div>
      </form>
    </Modal>
  );
}
