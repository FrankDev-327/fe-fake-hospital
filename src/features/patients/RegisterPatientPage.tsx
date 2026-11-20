import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { PageHeader } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useRegisterPatient } from './api';
import { toInput } from './patient-form';
import { PatientForm } from './PatientForm';

/** Front desk: register a new patient. */
export function RegisterPatientPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const registerPatient = useRegisterPatient();
  // a patient with this OIB/MBO already exists: offer to open that record instead
  const [existing, setExisting] = useState<{ id: string; mrn: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Register patient"
        subtitle="Name, date of birth and sex are required"
      />
      <div className="mb-4 space-y-2">
        {existing && (
          <Alert>
            This person is already registered as {existing.mrn}.{' '}
            <Link
              to="/patients/$patientId"
              params={{ patientId: existing.id }}
              className="font-medium underline"
            >
              Open their record
            </Link>
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
      <PatientForm
        submitLabel="Register"
        onCancel={() => void navigate({ to: '/patients' })}
        onSubmit={async (values) => {
          setExisting(null);
          setError(null);
          try {
            const patient = await registerPatient.mutateAsync(toInput(values));
            toast(
              `Registered ${patient.firstName} ${patient.lastName} (${patient.mrn})`,
            );
            await navigate({
              to: '/patients/$patientId',
              params: { patientId: patient.id },
            });
          } catch (e) {
            const body =
              e instanceof ApiError
                ? (e.body as { patientId?: string; mrn?: string })
                : null;
            if (
              e instanceof ApiError &&
              e.code === 'patient_already_registered' &&
              body?.patientId
            )
              setExisting({ id: body.patientId, mrn: body.mrn ?? '' });
            else setError(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
