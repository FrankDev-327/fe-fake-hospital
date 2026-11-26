import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ErrorMessage, Loading, PageHeader } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { patientName } from '@/lib/format';
import { usePatient, useUpdatePatient } from './api';
import type { Patient, PatientInput } from './api';
import { toInput } from './patient-form';
import { PatientForm } from './PatientForm';
import { t } from '@/i18n';

const route = getRouteApi('/app/patients/$patientId/edit');

/** Only the fields that changed (the backend wants a partial update) */
function changedFields(
  before: Patient,
  after: PatientInput,
): Partial<PatientInput> {
  const changes: Partial<PatientInput> = {};
  for (const key of Object.keys(after) as (keyof PatientInput)[]) {
    if ((before[key] ?? null) !== after[key])
      (changes as Record<string, unknown>)[key] = after[key];
  }
  return changes;
}

export function EditPatientPage() {
  const { patientId } = route.useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const patient = usePatient(patientId);
  const update = useUpdatePatient(patientId);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const back = () =>
    navigate({ to: '/patients/$patientId', params: { patientId } });

  if (patient.isPending) return <Loading />;
  if (patient.error) return <ErrorMessage error={patient.error} />;
  const p = patient.data;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={t('patients.editTitle', { name: patientName(p) })}
        subtitle={p.mrn}
      />
      <div className="mb-4 space-y-2">
        {stale && (
          <Alert>
            {t('patients.stale')}{' '}
            <Button
              variant="secondary"
              className="ml-2 py-1"
              onClick={() => {
                setStale(false);
                void patient.refetch();
              }}
            >
              {t('common.reload')}
            </Button>
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
      {/* key: a reload (new version) rebuilds the form with the fresh values */}
      <PatientForm
        key={p.version}
        initial={p}
        submitLabel={t('patients.saveChanges')}
        onCancel={() => void back()}
        onSubmit={async (values) => {
          setError(null);
          const changes = changedFields(p, toInput(values));
          if (Object.keys(changes).length === 0) return void back();
          try {
            await update.mutateAsync({ ...changes, version: p.version });
            toast(t('patients.saved'));
            await back();
          } catch (e) {
            if (e instanceof ApiError && e.code === 'stale_version')
              setStale(true);
            else
              setError(
                errorMessage(e, {
                  oib_belongs_to_another_patient: t('patients.oibTaken'),
                  mbo_belongs_to_another_patient: t('patients.mboTaken'),
                }),
              );
          }
        }}
      />
    </div>
  );
}
