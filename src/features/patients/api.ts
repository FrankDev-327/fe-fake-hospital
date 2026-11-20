import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PatientSummary {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  sex: string;
  dateOfBirth: string;
}

export interface Patient extends PatientSummary {
  oib: string | null;
  mbo: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  bloodType: string | null;
  deceasedAt: string | null;
  version: number;
}

/**
 * Query keys: TanStack Query caches by key. Same key = same data, shared by every component
 * that asks for it (the ward board and the patient list reuse "mine" without a 2nd request).
 */
export const patientKeys = {
  mine: ['patients', 'mine'] as const,
  search: (q: string) => ['patients', 'search', q] as const,
  one: (id: string) => ['patients', id] as const,
};

/** Doctor / nurse: my patients */
export const useMyPatients = (enabled = true) =>
  useQuery({
    queryKey: patientKeys.mine,
    queryFn: ({ signal }) =>
      api<{ items: PatientSummary[] }>('/patients/patients/mine', { signal }),
    select: (data) => data.items,
    enabled,
  });

/** Front desk: search by name or MRN (3+ characters) */
export const usePatientSearch = (q: string) =>
  useQuery({
    queryKey: patientKeys.search(q),
    queryFn: ({ signal }) =>
      api<{ items: PatientSummary[] }>(
        `/patients/patients/search?q=${encodeURIComponent(q)}`,
        { signal },
      ),
    select: (data) => data.items,
    enabled: q.trim().length >= 3,
  });

export const usePatient = (id: string) =>
  useQuery({
    queryKey: patientKeys.one(id),
    queryFn: ({ signal }) =>
      api<Patient>(`/patients/patients/${id}`, { signal }),
  });

// ---------- changes (mutations) ----------

export const SEXES = ['female', 'male', 'other', 'unknown'] as const;
export const BLOOD_TYPES = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  '0+',
  '0-',
] as const;

/** POST /patients/patients: what the backend accepts (optional fields are null when empty) */
export interface PatientInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: (typeof SEXES)[number];
  oib: string | null;
  mbo: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  bloodType: (typeof BLOOD_TYPES)[number] | null;
}

/**
 * useMutation = a request that CHANGES something. After it works we update/invalidate the
 * cached queries, so every screen showing that data refreshes.
 */
export function useRegisterPatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PatientInput) =>
      api<Patient>('/patients/patients', { method: 'POST', body: input }),
    onSuccess: (patient) => {
      queryClient.setQueryData(patientKeys.one(patient.id), patient);
      void queryClient.invalidateQueries({ queryKey: ['patients', 'search'] });
    },
  });
}

/** PATCH: only the changed fields + the version we loaded (409 stale_version if outdated) */
export function useUpdatePatient(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: Partial<PatientInput> & { version: number }) =>
      api<Patient>(`/patients/patients/${id}`, {
        method: 'PATCH',
        body: changes,
      }),
    onSuccess: (patient) => {
      queryClient.setQueryData(patientKeys.one(id), patient);
      void queryClient.invalidateQueries({ queryKey: ['patients', 'search'] });
      void queryClient.invalidateQueries({ queryKey: patientKeys.mine });
    },
  });
}

export interface Contact {
  id: string;
  relationship: string;
  name: string;
  phone: string;
}

const contactsKey = (patientId: string) => ['patients', patientId, 'contacts'];

export const useContacts = (patientId: string) =>
  useQuery({
    queryKey: contactsKey(patientId),
    queryFn: ({ signal }) =>
      api<{ items: Contact[] }>(`/patients/patients/${patientId}/contacts`, {
        signal,
      }),
    select: (data) => data.items,
  });

export function useAddContact(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Contact, 'id'>) =>
      api<Contact>(`/patients/patients/${patientId}/contacts`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: contactsKey(patientId) }),
  });
}
