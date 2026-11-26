import { z } from 'zod';
import { zmsg } from '@/i18n';
import { isValidOib } from '@/lib/oib';
import { BLOOD_TYPES, SEXES } from './api';
import type { Patient, PatientInput } from './api';

/** Today as YYYY-MM-DD (for the date of birth limit) */
export const today = () => new Date().toISOString().slice(0, 10);

/** Optional text: '' in the form means "not given" */
const optionalText = (
  rule: z.ZodType<string>,
  message: ReturnType<typeof zmsg>,
) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || rule.safeParse(v).success, message);

/**
 * The form works with strings (that's what inputs give us); toInput() turns them into what
 * the backend wants (null for empty). Rules match the backend's RegisterPatientBody.
 */
export const PatientFormSchema = z.object({
  firstName: z.string().trim().min(1, zmsg('common.required')).max(100),
  lastName: z.string().trim().min(1, zmsg('common.required')).max(100),
  dateOfBirth: z
    .string()
    .min(1, zmsg('common.required'))
    .refine(
      (d) => d >= '1900-01-01' && d <= today(),
      zmsg('patients.dobRange'),
    ),
  sex: z.enum(SEXES),
  oib: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidOib(v), zmsg('patients.oibInvalid')),
  mbo: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{9}$/.test(v), zmsg('patients.mbo9')),
  email: optionalText(z.email(), zmsg('patients.emailInvalid')),
  phone: optionalText(z.string().min(6).max(30), zmsg('patients.phoneLen')),
  address: optionalText(z.string().min(3).max(300), zmsg('common.min3')),
  bloodType: z.enum(['', ...BLOOD_TYPES]),
});
export type PatientFormValues = z.infer<typeof PatientFormSchema>;

export const toInput = (v: PatientFormValues): PatientInput => ({
  firstName: v.firstName.trim(),
  lastName: v.lastName.trim(),
  dateOfBirth: v.dateOfBirth,
  sex: v.sex,
  oib: v.oib.trim() || null,
  mbo: v.mbo.trim() || null,
  email: v.email.trim() || null,
  phone: v.phone.trim() || null,
  address: v.address.trim() || null,
  bloodType: v.bloodType || null,
});

export const toFormValues = (p?: Patient): PatientFormValues => ({
  firstName: p?.firstName ?? '',
  lastName: p?.lastName ?? '',
  dateOfBirth: p?.dateOfBirth ?? '',
  sex: (p?.sex as PatientFormValues['sex']) ?? 'unknown',
  oib: p?.oib ?? '',
  mbo: p?.mbo ?? '',
  email: p?.email ?? '',
  phone: p?.phone ?? '',
  address: p?.address ?? '',
  bloodType: (p?.bloodType as PatientFormValues['bloodType']) ?? '',
});
