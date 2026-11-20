import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/Button';
import { SelectField } from '@/components/fields';
import { TextField } from '@/components/TextField';
import { BLOOD_TYPES } from './api';
import type { Patient } from './api';
import { PatientFormSchema, toFormValues, today } from './patient-form';
import type { PatientFormValues } from './patient-form';

const SEX_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'unknown', label: 'Unknown' },
];
const BLOOD_OPTIONS = [
  { value: '', label: 'Unknown' },
  ...BLOOD_TYPES.map((b) => ({ value: b, label: b })),
];

export function PatientForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Patient;
  submitLabel: string;
  onSubmit: (values: PatientFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(PatientFormSchema),
    defaultValues: toFormValues(initial),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-700">
          Person
        </legend>
        <TextField
          label="First name"
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <TextField
          label="Last name"
          error={errors.lastName?.message}
          {...register('lastName')}
        />
        <TextField
          label="Date of birth"
          type="date"
          max={today()}
          error={errors.dateOfBirth?.message}
          {...register('dateOfBirth')}
        />
        <SelectField
          label="Sex"
          options={SEX_OPTIONS}
          error={errors.sex?.message}
          {...register('sex')}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-700">
          IDs (optional)
        </legend>
        <TextField
          label="OIB"
          inputMode="numeric"
          autoComplete="off"
          error={errors.oib?.message}
          {...register('oib')}
        />
        <TextField
          label="MBO (health insurance)"
          inputMode="numeric"
          autoComplete="off"
          error={errors.mbo?.message}
          {...register('mbo')}
        />
        <SelectField
          label="Blood type"
          options={BLOOD_OPTIONS}
          {...register('bloodType')}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-700">
          Contact (optional)
        </legend>
        <TextField
          label="Phone"
          type="tel"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          label="Email"
          type="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <div className="sm:col-span-2">
          <TextField
            label="Address"
            error={errors.address?.message}
            {...register('address')}
          />
        </div>
      </fieldset>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
