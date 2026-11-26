import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { BadgeTone } from '@/components/ui';
import { t } from '@/i18n';

export type AllergySeverity =
  'mild' | 'moderate' | 'severe' | 'life_threatening';

export interface Allergy {
  id: string;
  substance: string | null;
  atcCode: string | null;
  reaction: string | null;
  severity: AllergySeverity;
  status: string;
  recordedAt: string;
}

export const SEVERITY: Record<
  AllergySeverity,
  { label: string; tone: BadgeTone }
> = {
  mild: {
    get label() {
      return t('clinical.sevMild');
    },
    tone: 'gray',
  },
  moderate: {
    get label() {
      return t('clinical.sevModerate');
    },
    tone: 'amber',
  },
  severe: {
    get label() {
      return t('clinical.sevSevere');
    },
    tone: 'red',
  },
  life_threatening: {
    get label() {
      return t('clinical.sevLife');
    },
    tone: 'red',
  },
};

export const useAllergies = (patientId: string, enabled = true) =>
  useQuery({
    queryKey: ['patients', patientId, 'allergies'],
    queryFn: ({ signal }) =>
      api<{ items: Allergy[] }>(`/clinical/patients/${patientId}/allergies`, {
        signal,
      }),
    select: (data) => data.items.filter((a) => a.status === 'active'),
    enabled,
  });

// ---------- visits (encounters) ----------

export type EncounterType = 'outpatient' | 'emergency' | 'inpatient';
export type EncounterStatus = 'in_progress' | 'finished' | 'cancelled';

export interface Encounter {
  id: string;
  patientId: string;
  doctorId: string;
  type: EncounterType;
  status: EncounterStatus;
  reason: string | null;
  startedAt: string;
  endedAt: string | null;
  version: number;
}

export const ENCOUNTER_TYPE_LABEL: Record<EncounterType, string> = {
  get outpatient() {
    return t('clinical.typeOutpatient');
  },
  get emergency() {
    return t('clinical.typeEmergency');
  },
  get inpatient() {
    return t('clinical.typeInpatient');
  },
};

export const ENCOUNTER_STATUS: Record<
  EncounterStatus,
  { label: string; tone: BadgeTone }
> = {
  in_progress: {
    get label() {
      return t('clinical.encOpen');
    },
    tone: 'blue',
  },
  finished: {
    get label() {
      return t('clinical.encFinished');
    },
    tone: 'green',
  },
  cancelled: {
    get label() {
      return t('clinical.encCancelled');
    },
    tone: 'gray',
  },
};

const chart = (patientId: string) => `/clinical/patients/${patientId}`;

/** Keys: everything about one patient starts with ['patients', id] (easy to invalidate) */
export const clinicalKeys = {
  encounters: (patientId: string) =>
    ['patients', patientId, 'encounters'] as const,
  encounter: (patientId: string, id: string) =>
    ['patients', patientId, 'encounters', id] as const,
  notes: (patientId: string, encounterId: string) =>
    ['patients', patientId, 'notes', encounterId] as const,
  diagnoses: (patientId: string) =>
    ['patients', patientId, 'diagnoses'] as const,
};

export const useEncounters = (patientId: string) =>
  useQuery({
    queryKey: clinicalKeys.encounters(patientId),
    queryFn: ({ signal }) =>
      api<{ items: Encounter[] }>(`${chart(patientId)}/encounters`, { signal }),
    select: (data) => data.items,
  });

/** The patient's open visit (newest), where new prescriptions, vitals and lab orders go */
export function useOpenEncounter(patientId: string) {
  const encounters = useEncounters(patientId);
  return encounters.data?.find((e) => e.status === 'in_progress');
}

export const useEncounter = (patientId: string, id: string) =>
  useQuery({
    queryKey: clinicalKeys.encounter(patientId, id),
    queryFn: ({ signal }) =>
      api<Encounter>(`${chart(patientId)}/encounters/${id}`, { signal }),
  });

export function useStartEncounter(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: EncounterType; reason: string | null }) =>
      api<Encounter>(`${chart(patientId)}/encounters`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: clinicalKeys.encounters(patientId),
      }),
  });
}

/** finish | cancel */
export function useCloseEncounter(
  patientId: string,
  id: string,
  action: 'finish' | 'cancel',
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<Encounter>(`${chart(patientId)}/encounters/${id}/${action}`, {
        method: 'POST',
      }),
    onSuccess: (encounter) => {
      queryClient.setQueryData(
        clinicalKeys.encounter(patientId, id),
        encounter,
      );
      void queryClient.invalidateQueries({
        queryKey: clinicalKeys.encounters(patientId),
      });
    },
  });
}

// ---------- notes ----------

export type NoteType = 'soap' | 'nursing' | 'procedure' | 'discharge';
export type NoteStatus = 'draft' | 'signed' | 'amended' | 'entered_in_error';

export interface Note {
  id: string;
  encounterId: string;
  authorId: string;
  type: NoteType;
  status: NoteStatus;
  body: string | null;
  amendsId: string | null;
  amendReason: string | null;
  errorReason: string | null;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export const NOTE_TYPE_LABEL: Record<NoteType, string> = {
  get soap() {
    return t('clinical.noteSoap');
  },
  get nursing() {
    return t('clinical.noteNursing');
  },
  get procedure() {
    return t('clinical.noteProcedure');
  },
  get discharge() {
    return t('clinical.noteDischarge');
  },
};

/** Which note types each role writes (same rule as the backend) */
export const NOTE_TYPES_BY_ROLE: Partial<Record<string, NoteType[]>> = {
  doctor: ['soap', 'procedure', 'discharge'],
  nurse: ['nursing'],
};

/** A SOAP note starts with its four headings */
export const NOTE_TEMPLATE: Record<NoteType, string> = {
  soap: 'S: \nO: \nA: \nP: ',
  nursing: '',
  get procedure() {
    return t('clinical.tplProcedure');
  },
  get discharge() {
    return t('clinical.tplDischarge');
  },
};

export const useNotes = (patientId: string, encounterId: string) =>
  useQuery({
    queryKey: clinicalKeys.notes(patientId, encounterId),
    queryFn: ({ signal }) =>
      api<{ items: Note[] }>(
        `${chart(patientId)}/notes?encounterId=${encounterId}`,
        {
          signal,
        },
      ),
    select: (data) => data.items,
  });

/**
 * All note actions in one hook: each one refreshes the visit's notes afterwards.
 * (The amend action creates a new draft; sign of an amendment flips the original to "amended".)
 */
export function useNoteActions(patientId: string, encounterId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () =>
    queryClient.invalidateQueries({
      queryKey: clinicalKeys.notes(patientId, encounterId),
    });
  const base = chart(patientId);

  const create = useMutation({
    mutationFn: (input: { type: NoteType; body: string }) =>
      api<Note>(`${base}/encounters/${encounterId}/notes`, {
        method: 'POST',
        body: input,
      }),
    onSuccess,
  });
  const save = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      body: string;
      version: number;
    }) => api<Note>(`${base}/notes/${id}`, { method: 'PATCH', body }),
    onSuccess,
  });
  const discard = useMutation({
    mutationFn: (id: string) =>
      api<undefined>(`${base}/notes/${id}`, { method: 'DELETE' }),
    onSuccess,
  });
  const sign = useMutation({
    mutationFn: (id: string) =>
      api<Note>(`${base}/notes/${id}/sign`, { method: 'POST' }),
    onSuccess,
  });
  const amend = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      body: string;
      reason: string;
    }) => api<Note>(`${base}/notes/${id}/amend`, { method: 'POST', body }),
    onSuccess,
  });
  const markError = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api<Note>(`${base}/notes/${id}/void`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess,
  });
  return { create, save, discard, sign, amend, markError };
}

// ---------- diagnoses ----------

export type DiagnosisStatus =
  'provisional' | 'confirmed' | 'resolved' | 'entered_in_error';

export interface Diagnosis {
  id: string;
  encounterId: string;
  icd10Code: string;
  icd10Title: string | null;
  rank: 'primary' | 'secondary';
  status: DiagnosisStatus;
  note: string | null;
  replacesId: string | null;
  diagnosedBy: string;
  diagnosedAt: string;
}

export const DIAGNOSIS_STATUS: Record<
  DiagnosisStatus,
  { label: string; tone: BadgeTone }
> = {
  provisional: {
    get label() {
      return t('clinical.dxProvisional');
    },
    tone: 'amber',
  },
  confirmed: {
    get label() {
      return t('clinical.dxConfirmed');
    },
    tone: 'teal',
  },
  resolved: {
    get label() {
      return t('clinical.dxResolved');
    },
    tone: 'green',
  },
  entered_in_error: {
    get label() {
      return t('clinical.dxError');
    },
    tone: 'gray',
  },
};

export interface Icd10Code {
  code: string;
  title: string;
  chapter: string;
}

/** Current diagnoses of the patient (latest version of each, errors left out) */
export const useDiagnoses = (patientId: string) =>
  useQuery({
    queryKey: clinicalKeys.diagnoses(patientId),
    queryFn: ({ signal }) =>
      api<{ items: Diagnosis[] }>(`${chart(patientId)}/diagnoses`, { signal }),
    select: (data) => data.items,
  });

export function useDiagnosisActions(patientId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: clinicalKeys.diagnoses(patientId),
    });
  const base = chart(patientId);
  return {
    add: useMutation({
      mutationFn: (input: {
        encounterId: string;
        icd10Code: string;
        rank: Diagnosis['rank'];
        status: 'provisional' | 'confirmed';
        note: string | null;
      }) => {
        const { encounterId, ...body } = input;
        return api<Diagnosis>(`${base}/encounters/${encounterId}/diagnoses`, {
          method: 'POST',
          body,
        });
      },
      onSuccess: refresh,
    }),
    revise: useMutation({
      mutationFn: (input: { id: string; status: DiagnosisStatus }) =>
        api<Diagnosis>(`${base}/diagnoses/${input.id}/revise`, {
          method: 'POST',
          body: { status: input.status },
        }),
      onSuccess: refresh,
    }),
  };
}

export const useIcd10Search = (q: string) =>
  useQuery({
    queryKey: ['icd10', q],
    queryFn: ({ signal }) =>
      api<Icd10Code[]>(`/clinical/icd10?q=${encodeURIComponent(q)}`, {
        signal,
      }),
    enabled: q.trim().length >= 2,
    staleTime: 60 * 60_000, // the catalog doesn't change
  });

/** True when the text is only headings like "S:" / "Diagnosis:" with nothing written under them */
export const isEmptyNote = (body: string) =>
  body.replace(/^[A-Za-z][A-Za-z -]*:[ \t]*$/gm, '').trim() === '';
