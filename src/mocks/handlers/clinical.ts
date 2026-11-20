import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';
import type { StaffRole } from '@/auth/types';
import { ALLERGIES } from '../data/clinical';
import type { FakeDiagnosis, FakeNote } from '../data/charts';
import { ICD10 } from '../data/icd10';
import { labHandlers } from './lab';
import { vitalsHandlers } from './vitals';
import { mockDb, newId, nowIso } from '../db';
import {
  badRequest,
  chartAccess,
  conflict,
  forbidden,
  guard,
  notFound,
  validationError,
} from './guard';

const P = '/api/clinical/patients/:patientId';

/** Which note types each role writes (apps/clinical notes.service.ts) */
const TYPES_BY_ROLE: Partial<Record<StaffRole, readonly FakeNote['type'][]>> = {
  doctor: ['soap', 'procedure', 'discharge'],
  nurse: ['nursing'],
};

const noteBody = z.string().trim().min(1).max(20_000);
const reason = z.string().trim().min(3).max(200);
const icd10 = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/);
const RANKS = ['primary', 'secondary'] as const;
const DX_STATUSES = [
  'provisional',
  'confirmed',
  'resolved',
  'entered_in_error',
] as const;

const StartEncounterBody = z.object({
  type: z.enum(['outpatient', 'emergency', 'inpatient']),
  reason: z.string().trim().min(2).max(2000).nullable().default(null),
  departmentId: z.uuid().nullable().default(null),
});
const CreateNoteBody = z.object({
  type: z.enum(['soap', 'nursing', 'procedure', 'discharge']),
  body: noteBody,
});
const EditNoteBody = z.object({
  body: noteBody,
  version: z.number().int().min(1),
});
const AmendNoteBody = z.object({ body: noteBody, reason });
const VoidNoteBody = z.object({ reason });
const AddDiagnosisBody = z.object({
  icd10Code: icd10,
  rank: z.enum(RANKS),
  status: z.enum(['provisional', 'confirmed']).default('provisional'),
  note: z.string().trim().min(1).max(2000).nullable().default(null),
});
const ReviseDiagnosisBody = z.object({
  icd10Code: icd10.optional(),
  rank: z.enum(RANKS).optional(),
  status: z.enum(DX_STATUSES),
  note: z.string().trim().min(1).max(2000).nullable().optional(),
});

const json = (request: Request) => request.json().catch(() => null);

/** An encounter that is still open: 404 if missing, 409 encounter_closed otherwise */
function openEncounter(patientId: string, encounterId: string) {
  const e = mockDb
    .get()
    .encounters.find((x) => x.id === encounterId && x.patientId === patientId);
  if (!e) return notFound('encounter_not_found');
  if (e.status !== 'in_progress')
    return conflict('encounter_closed', { status: e.status });
  return e;
}

const encounterView = ({ ...e }) => e;
const noteView = ({ patientId: _, ...n }: FakeNote) => n;
const diagnosisView = ({ patientId: _, ...d }: FakeDiagnosis) => ({
  ...d,
  icd10Title: ICD10.find((c) => c.code === d.icd10Code)?.title ?? null,
});

/** Someone else's draft is invisible (404); a signed note can't be edited (409). */
function ownDraft(patientId: string, noteId: string, staffId: string) {
  const note = mockDb
    .get()
    .notes.find((n) => n.id === noteId && n.patientId === patientId);
  if (!note || (note.status === 'draft' && note.authorId !== staffId))
    return notFound('note_not_found');
  if (note.status !== 'draft')
    return conflict('note_is_signed', {
      status: note.status,
      hint: 'amend it instead',
    });
  return note;
}

/** apps/clinical (/api/clinical/...) */
export const clinicalHandlers = [
  ...vitalsHandlers,
  ...labHandlers,
  // ---------- encounters (visits) ----------
  http.get(`${P}/encounters`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    return HttpResponse.json({
      items: mockDb
        .get()
        .encounters.filter((e) => e.patientId === access.patientId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map(encounterView),
    });
  }),

  http.get(`${P}/encounters/:id`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const e = mockDb
      .get()
      .encounters.find(
        (x) => x.id === params.id && x.patientId === access.patientId,
      );
    return e
      ? HttpResponse.json(encounterView(e))
      : notFound('encounter_not_found');
  }),

  http.post(`${P}/encounters`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor']);
    if (access instanceof Response) return access;
    const parsed = StartEncounterBody.safeParse(await json(request));
    if (!parsed.success) return validationError(parsed.error);
    const encounter = {
      id: newId(),
      patientId: access.patientId,
      doctorId: access.staff.id,
      ...parsed.data,
      status: 'in_progress' as const,
      startedAt: nowIso(),
      endedAt: null,
      version: 1,
    };
    mockDb.get().encounters.push(encounter);
    mockDb.save();
    return HttpResponse.json(encounterView(encounter), { status: 201 });
  }),

  /** Refused while the visit still has unsigned notes (anyone's drafts). */
  http.post(`${P}/encounters/:id/finish`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor']);
    if (access instanceof Response) return access;
    const e = openEncounter(access.patientId, String(params.id));
    if (e instanceof Response) return e;
    const drafts = mockDb
      .get()
      .notes.filter(
        (n) => n.encounterId === e.id && n.status === 'draft',
      ).length;
    if (drafts) return conflict('unsigned_notes', { drafts });
    Object.assign(e, {
      status: 'finished',
      endedAt: nowIso(),
      version: e.version + 1,
    });
    mockDb.save();
    return HttpResponse.json(encounterView(e));
  }),

  /** For a visit opened by mistake: only while nothing was signed or diagnosed in it. */
  http.post(`${P}/encounters/:id/cancel`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor']);
    if (access instanceof Response) return access;
    const e = openEncounter(access.patientId, String(params.id));
    if (e instanceof Response) return e;
    const { notes, diagnoses } = mockDb.get();
    const records =
      notes.filter((n) => n.encounterId === e.id && n.status !== 'draft')
        .length + diagnoses.filter((d) => d.encounterId === e.id).length;
    if (records) return conflict('encounter_has_records');
    Object.assign(e, {
      status: 'cancelled',
      endedAt: nowIso(),
      version: e.version + 1,
    });
    mockDb.save();
    return HttpResponse.json(encounterView(e));
  }),

  // ---------- notes ----------
  /** Signed/amended/voided notes, plus the caller's OWN drafts. Newest first. */
  http.get(`${P}/notes`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const encounterId = new URL(request.url).searchParams.get('encounterId');
    return HttpResponse.json({
      items: mockDb
        .get()
        .notes.filter(
          (n) =>
            n.patientId === access.patientId &&
            (!encounterId || n.encounterId === encounterId) &&
            (n.status !== 'draft' || n.authorId === access.staff.id),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(noteView),
    });
  }),

  http.post(
    `${P}/encounters/:encounterId/notes`,
    async ({ request, params }) => {
      await delay();
      const access = chartAccess(request, params, ['doctor', 'nurse']);
      if (access instanceof Response) return access;
      const parsed = CreateNoteBody.safeParse(await json(request));
      if (!parsed.success) return validationError(parsed.error);
      if (!TYPES_BY_ROLE[access.staff.role]?.includes(parsed.data.type))
        return forbidden('note_type_not_allowed_for_role', {
          type: parsed.data.type,
          role: access.staff.role,
        });
      const e = openEncounter(access.patientId, String(params.encounterId));
      if (e instanceof Response) return e;
      const now = nowIso();
      const note: FakeNote = {
        id: newId(),
        patientId: access.patientId,
        encounterId: e.id,
        authorId: access.staff.id,
        type: parsed.data.type,
        status: 'draft',
        body: parsed.data.body,
        amendsId: null,
        amendReason: null,
        errorReason: null,
        signedAt: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      mockDb.get().notes.push(note);
      mockDb.save();
      return HttpResponse.json(noteView(note), { status: 201 });
    },
  ),

  http.patch(`${P}/notes/:id`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const parsed = EditNoteBody.safeParse(await json(request));
    if (!parsed.success) return validationError(parsed.error);
    const note = ownDraft(access.patientId, String(params.id), access.staff.id);
    if (note instanceof Response) return note;
    if (note.version !== parsed.data.version)
      return conflict('stale_version', { currentVersion: note.version });
    Object.assign(note, {
      body: parsed.data.body,
      version: note.version + 1,
      updatedAt: nowIso(),
    });
    mockDb.save();
    return HttpResponse.json(noteView(note));
  }),

  /** Discard a draft */
  http.delete(`${P}/notes/:id`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const note = ownDraft(access.patientId, String(params.id), access.staff.id);
    if (note instanceof Response) return note;
    const db = mockDb.get();
    db.notes = db.notes.filter((n) => n.id !== note.id);
    mockDb.save();
    return new HttpResponse(null, { status: 204 });
  }),

  /** Signing an amendment marks the original "amended" at the same time. */
  http.post(`${P}/notes/:id/sign`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const note = ownDraft(access.patientId, String(params.id), access.staff.id);
    if (note instanceof Response) return note;
    if (note.amendsId) {
      const original = mockDb.get().notes.find((n) => n.id === note.amendsId);
      if (!original || original.status !== 'signed')
        return conflict('original_not_signed', { status: original?.status });
      original.status = 'amended';
    }
    Object.assign(note, { status: 'signed', signedAt: nowIso() });
    mockDb.save();
    return HttpResponse.json(noteView(note));
  }),

  /** Correction of a signed note: a new DRAFT linked to it. One amendment per note. */
  http.post(`${P}/notes/:id/amend`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const parsed = AmendNoteBody.safeParse(await json(request));
    if (!parsed.success) return validationError(parsed.error);
    const { notes } = mockDb.get();
    const original = notes.find(
      (n) => n.id === params.id && n.patientId === access.patientId,
    );
    if (
      !original ||
      (original.status === 'draft' && original.authorId !== access.staff.id)
    )
      return notFound('note_not_found');
    if (original.status !== 'signed')
      return conflict('only_signed_notes_can_be_amended', {
        status: original.status,
      });
    if (!TYPES_BY_ROLE[access.staff.role]?.includes(original.type))
      return forbidden('note_type_not_allowed_for_role', {
        type: original.type,
        role: access.staff.role,
      });
    if (notes.some((n) => n.amendsId === original.id))
      return conflict('amendment_already_exists');
    const now = nowIso();
    const amendment: FakeNote = {
      ...original,
      id: newId(),
      authorId: access.staff.id,
      status: 'draft',
      body: parsed.data.body,
      amendsId: original.id,
      amendReason: parsed.data.reason,
      errorReason: null,
      signedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    notes.push(amendment);
    mockDb.save();
    return HttpResponse.json(noteView(amendment), { status: 201 });
  }),

  /** The author marks their own signed note as entered in error (e.g. wrong patient). */
  http.post(`${P}/notes/:id/void`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const parsed = VoidNoteBody.safeParse(await json(request));
    if (!parsed.success) return validationError(parsed.error);
    const note = mockDb
      .get()
      .notes.find(
        (n) => n.id === params.id && n.patientId === access.patientId,
      );
    if (!note || (note.status === 'draft' && note.authorId !== access.staff.id))
      return notFound('note_not_found');
    if (note.status !== 'signed')
      return conflict('only_signed_notes_can_be_voided', {
        status: note.status,
      });
    if (note.authorId !== access.staff.id)
      return forbidden('only_the_author_can_void');
    Object.assign(note, {
      status: 'entered_in_error',
      errorReason: parsed.data.reason,
    });
    mockDb.save();
    return HttpResponse.json(noteView(note));
  }),

  // ---------- diagnoses ----------
  /** Current list (not replaced, not entered in error), or ?history=true for everything */
  http.get(`${P}/diagnoses`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    const history = new URL(request.url).searchParams.get('history') === 'true';
    const all = mockDb
      .get()
      .diagnoses.filter((d) => d.patientId === access.patientId);
    const items = history
      ? all.sort((a, b) => a.diagnosedAt.localeCompare(b.diagnosedAt))
      : all
          .filter(
            (d) =>
              d.status !== 'entered_in_error' &&
              !all.some((r) => r.replacesId === d.id),
          )
          .sort((a, b) => b.diagnosedAt.localeCompare(a.diagnosedAt));
    return HttpResponse.json({ items: items.map(diagnosisView) });
  }),

  http.post(
    `${P}/encounters/:encounterId/diagnoses`,
    async ({ request, params }) => {
      await delay();
      const access = chartAccess(request, params, ['doctor']);
      if (access instanceof Response) return access;
      const parsed = AddDiagnosisBody.safeParse(await json(request));
      if (!parsed.success) return validationError(parsed.error);
      const e = openEncounter(access.patientId, String(params.encounterId));
      if (e instanceof Response) return e;
      if (!ICD10.some((c) => c.code === parsed.data.icd10Code))
        return badRequest('unknown_icd10_code');
      const diagnosis: FakeDiagnosis = {
        id: newId(),
        patientId: access.patientId,
        encounterId: e.id,
        ...parsed.data,
        replacesId: null,
        diagnosedBy: access.staff.id,
        diagnosedAt: nowIso(),
      };
      mockDb.get().diagnoses.push(diagnosis);
      mockDb.save();
      return HttpResponse.json(diagnosisView(diagnosis), { status: 201 });
    },
  ),

  /** A change is a NEW row replacing the old one (append-only). Works on finished visits too. */
  http.post(`${P}/diagnoses/:id/revise`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor']);
    if (access instanceof Response) return access;
    const parsed = ReviseDiagnosisBody.safeParse(await json(request));
    if (!parsed.success) return validationError(parsed.error);
    const { diagnoses } = mockDb.get();
    const old = diagnoses.find(
      (d) => d.id === params.id && d.patientId === access.patientId,
    );
    if (!old) return notFound('diagnosis_not_found');
    if (old.status === 'entered_in_error')
      return conflict('diagnosis_entered_in_error');
    if (diagnoses.some((d) => d.replacesId === old.id))
      return conflict('diagnosis_already_revised');
    const icd10Code = parsed.data.icd10Code ?? old.icd10Code;
    if (!ICD10.some((c) => c.code === icd10Code))
      return badRequest('unknown_icd10_code');
    const revised: FakeDiagnosis = {
      ...old,
      id: newId(),
      icd10Code,
      rank: parsed.data.rank ?? old.rank,
      status: parsed.data.status,
      note: parsed.data.note === undefined ? old.note : parsed.data.note,
      replacesId: old.id,
      diagnosedBy: access.staff.id,
      diagnosedAt: nowIso(),
    };
    diagnoses.push(revised);
    mockDb.save();
    return HttpResponse.json(diagnosisView(revised), { status: 201 });
  }),

  /** ICD-10 lookup: code prefix first, then title matches. Max 20. */
  http.get('/api/clinical/icd10', async ({ request }) => {
    await delay();
    const staff = guard(request, ['doctor', 'nurse']);
    if (staff instanceof Response) return staff;
    const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase();
    if (!q || q.length < 2) return badRequest();
    const byCode = ICD10.filter((c) => c.code.toLowerCase().startsWith(q));
    const byTitle = ICD10.filter(
      (c) => !byCode.includes(c) && c.title.toLowerCase().includes(q),
    );
    return HttpResponse.json([...byCode, ...byTitle].slice(0, 20));
  }),

  // ---------- allergies (read only for now) ----------
  http.get(`${P}/allergies`, async ({ request, params }) => {
    await delay();
    const access = chartAccess(request, params, ['doctor', 'nurse']);
    if (access instanceof Response) return access;
    return HttpResponse.json({
      items: ALLERGIES.filter((a) => a.patientId === access.patientId).map(
        ({ patientId: _, ...a }) => a,
      ),
    });
  }),
];
