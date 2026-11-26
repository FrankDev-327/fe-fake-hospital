import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/Button';
import { SelectField } from '@/components/fields';
import { TextField } from '@/components/TextField';
import { BLOOD_TYPES } from './api';
import type { Patient } from './api';
import { PatientFormSchema, toFormValues, today } from './patient-form';
import type { PatientFormValues } from './patient-form';
import { t } from '@/i18n';

const SEX_OPTIONS = [
  {
    value: 'female',
    get label() {
      return t('patients.sexFemale');
    },
  },
  {
    value: 'male',
    get label() {
      return t('patients.sexMale');
    },
  },
  {
    value: 'other',
    get label() {
      return t('patients.sexOther');
    },
  },
  {
    value: 'unknown',
    get label() {
      return t('patients.unknown');
    },
  },
];
const BLOOD_OPTIONS = [
  {
    value: '',
    get label() {
      return t('patients.unknown');
    },
  },
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
          {t('patients.person')}
        </legend>
        <TextField
          label={t('patients.firstName')}
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <TextField
          label={t('patients.lastName')}
          error={errors.lastName?.message}
          {...register('lastName')}
        />
        <TextField
          label={t('patients.dob')}
          type="date"
          max={today()}
          error={errors.dateOfBirth?.message}
          {...register('dateOfBirth')}
        />
        <SelectField
          label={t('patients.sex')}
          options={SEX_OPTIONS}
          error={errors.sex?.message}
          {...register('sex')}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-700">
          {t('patients.ids')}
        </legend>
        <TextField
          label="OIB"
          inputMode="numeric"
          autoComplete="off"
          error={errors.oib?.message}
          {...register('oib')}
        />
        <TextField
          label={t('patients.mboLong')}
          inputMode="numeric"
          autoComplete="off"
          error={errors.mbo?.message}
          {...register('mbo')}
        />
        <SelectField
          label={t('patients.bloodType')}
          options={BLOOD_OPTIONS}
          {...register('bloodType')}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-700">
          {t('patients.contactOptional')}
        </legend>
        <TextField
          label={t('common.phone')}
          type="tel"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          label={t('common.email')}
          type="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <div className="sm:col-span-2">
          <TextField
            label={t('common.address')}
            error={errors.address?.message}
            {...register('address')}
          />
        </div>
      </fieldset>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('common.saving') : submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
