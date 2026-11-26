import { useState } from 'react';
import type { StaffRole } from '@/auth/types';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { SelectField, TextAreaField } from '@/components/fields';
import { Modal } from '@/components/Modal';
import { Badge, QueryState } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { StaffName } from '@/features/staff/StaffName';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import {
  isEmptyNote,
  NOTE_TEMPLATE,
  NOTE_TYPE_LABEL,
  NOTE_TYPES_BY_ROLE,
  useNoteActions,
  useNotes,
} from './api';
import type { Note, NoteType } from './api';
import { t } from '@/i18n';

const NOTE_ERRORS = {
  get stale_version() {
    return t('clinical.nStale');
  },
  get encounter_closed() {
    return t('clinical.nClosed');
  },
  get note_is_signed() {
    return t('clinical.nSigned');
  },
  get amendment_already_exists() {
    return t('clinical.nAmendExists');
  },
  get only_the_author_can_void() {
    return t('clinical.nOnlyAuthor');
  },
  get original_not_signed() {
    return t('clinical.nOrigChanged');
  },
};

interface Props {
  patientId: string;
  encounterId: string;
  open: boolean;
  me: { id: string; role: StaffRole };
}

/**
 * The notes of one visit. Life of a note:
 *   draft (only the author sees it, can edit/discard) -> signed (read-only, part of the record)
 *   signed -> amended   (a correction was written and signed; the original stays visible)
 *   signed -> entered_in_error (author marks it wrong, with a reason; stays visible, crossed out)
 */
export function NotesSection({ patientId, encounterId, open, me }: Props) {
  const notes = useNotes(patientId, encounterId);
  const actions = useNoteActions(patientId, encounterId);
  const myTypes = NOTE_TYPES_BY_ROLE[me.role] ?? [];
  const [newType, setNewType] = useState<NoteType | null>(null);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('clinical.notes')}</h2>
        {open && myTypes.length > 0 && !newType && (
          <div className="flex gap-2">
            {myTypes.map((type) => (
              <Button
                key={type}
                variant="secondary"
                onClick={() => setNewType(type)}
              >
                {t('clinical.newNote', {
                  type: NOTE_TYPE_LABEL[type].toLowerCase(),
                })}
              </Button>
            ))}
          </div>
        )}
      </div>

      {newType && (
        <NewNote
          type={newType}
          actions={actions}
          onDone={() => setNewType(null)}
        />
      )}

      <QueryState
        query={notes}
        isEmpty={(n) => n.length === 0 && !newType}
        empty={t('clinical.noNotes')}
      >
        {(items) => (
          <ul className="space-y-3">
            {items.map((n) => (
              <NoteItem
                key={n.id}
                note={n}
                all={items}
                me={me}
                actions={actions}
              />
            ))}
          </ul>
        )}
      </QueryState>
    </section>
  );
}

type Actions = ReturnType<typeof useNoteActions>;

/** A new note is created as a draft on the first save. */
function NewNote({
  type,
  actions,
  onDone,
}: {
  type: NoteType;
  actions: Actions;
  onDone: () => void;
}) {
  const [body, setBody] = useState(NOTE_TEMPLATE[type]);
  const toast = useToast();
  const create = actions.create;
  return (
    <div className="rounded-lg border-2 border-dashed border-teal-300 bg-white p-4">
      <TextAreaField
        label={NOTE_TYPE_LABEL[type]}
        rows={8}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        autoFocus
      />
      {create.error && (
        <div className="mt-2">
          <Alert>{errorMessage(create.error, NOTE_ERRORS)}</Alert>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button
          disabled={!body.trim() || create.isPending}
          onClick={() =>
            create.mutate(
              { type, body },
              {
                onSuccess: () => {
                  toast(t('clinical.draftSavedSign'));
                  onDone();
                },
              },
            )
          }
        >
          {t('clinical.saveDraft')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function NoteItem({
  note,
  all,
  me,
  actions,
}: {
  note: Note;
  all: Note[];
  me: Props['me'];
  actions: Actions;
}) {
  const [dialog, setDialog] = useState<'amend' | 'error' | 'discard' | null>(
    null,
  );
  const mine = note.authorId === me.id;
  const canWriteType = (NOTE_TYPES_BY_ROLE[me.role] ?? []).includes(note.type);
  const amendment = all.find((n) => n.amendsId === note.id);
  const original = note.amendsId
    ? all.find((n) => n.id === note.amendsId)
    : undefined;

  if (note.status === 'draft' && mine)
    return (
      <li>
        <DraftEditor
          note={note}
          original={original}
          actions={actions}
          onDiscard={() => setDialog('discard')}
        />
        {dialog === 'discard' && (
          <ConfirmDiscard
            note={note}
            actions={actions}
            onClose={() => setDialog(null)}
          />
        )}
      </li>
    );

  const crossed =
    note.status === 'amended' || note.status === 'entered_in_error';
  return (
    <li
      className={`rounded-lg border bg-white p-4 ${crossed ? 'border-slate-200 opacity-70' : 'border-slate-200'}`}
    >
      <NoteHeader note={note} />
      {note.amendsId && (
        <p className="mb-2 text-xs text-slate-500">
          {t('clinical.correction')}
          {original?.signedAt
            ? t('clinical.correctionOf', {
                at: formatDateTime(original.signedAt),
              })
            : ''}
          : <em>{note.amendReason}</em>
        </p>
      )}
      <p
        className={`text-sm whitespace-pre-wrap ${crossed ? 'line-through' : ''}`}
      >
        {note.body}
      </p>
      {note.status === 'amended' && (
        <p className="mt-2 text-xs text-slate-500">{t('clinical.replaced')}</p>
      )}
      {note.status === 'entered_in_error' && (
        <p className="mt-2 text-xs text-red-700">
          {t('clinical.markedError', { reason: note.errorReason })}
        </p>
      )}

      {note.status === 'signed' && (
        <div className="mt-3 flex gap-2">
          {canWriteType && !amendment && (
            <Button
              variant="secondary"
              className="py-1"
              onClick={() => setDialog('amend')}
            >
              {t('clinical.amend')}
            </Button>
          )}
          {mine && (
            <Button
              variant="ghost"
              className="py-1 text-red-700"
              onClick={() => setDialog('error')}
            >
              {t('clinical.markError')}
            </Button>
          )}
        </div>
      )}
      {dialog === 'amend' && (
        <AmendDialog
          note={note}
          actions={actions}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'error' && (
        <MarkErrorDialog
          note={note}
          actions={actions}
          onClose={() => setDialog(null)}
        />
      )}
    </li>
  );
}

const STATUS_BADGE: Record<
  Note['status'],
  { label: string; tone: 'gray' | 'amber' | 'green' | 'red' }
> = {
  draft: {
    get label() {
      return t('clinical.stDraft');
    },
    tone: 'amber',
  },
  signed: {
    get label() {
      return t('clinical.stSigned');
    },
    tone: 'green',
  },
  amended: {
    get label() {
      return t('clinical.stAmended');
    },
    tone: 'gray',
  },
  entered_in_error: {
    get label() {
      return t('clinical.stError');
    },
    tone: 'red',
  },
};

function NoteHeader({ note }: { note: Note }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{NOTE_TYPE_LABEL[note.type]}</span>
      <Badge tone={STATUS_BADGE[note.status].tone}>
        {STATUS_BADGE[note.status].label}
      </Badge>
      <span className="text-slate-500">
        <StaffName id={note.authorId} />
        {' · '}
        {note.signedAt
          ? t('clinical.signedAt', { at: formatDateTime(note.signedAt) })
          : t('clinical.startedAt', { at: formatDateTime(note.createdAt) })}
      </span>
    </div>
  );
}

/** My draft: edit, save, sign (saves first if changed), discard. */
function DraftEditor({
  note,
  original,
  actions,
  onDiscard,
}: {
  note: Note;
  original?: Note;
  actions: Actions;
  onDiscard: () => void;
}) {
  const [body, setBody] = useState(note.body ?? '');
  const toast = useToast();
  const dirty = body !== note.body;
  const busy = actions.save.isPending || actions.sign.isPending;
  const error = actions.save.error ?? actions.sign.error;

  const save = () =>
    actions.save.mutateAsync({ id: note.id, body, version: note.version });

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50/40 p-4">
      <NoteHeader note={note} />
      {note.amendsId && (
        <p className="mb-2 text-xs text-slate-600">
          {t('clinical.correctionOfSigned')}
          {original?.signedAt
            ? ` from ${formatDateTime(original.signedAt)}`
            : ''}
          . Reason: <em>{note.amendReason}</em>. Signing it replaces the
          original.
        </p>
      )}
      <TextAreaField
        label={t('clinical.text')}
        rows={8}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error && (
        <div className="mt-2">
          <Alert>{errorMessage(error, NOTE_ERRORS)}</Alert>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={busy || isEmptyNote(body)}
          title={isEmptyNote(body) ? t('clinical.writeFirst') : undefined}
          onClick={async () => {
            // sign exactly what's on screen: save first, and stop if saving failed
            if (
              dirty &&
              !(await save().then(
                () => true,
                () => false,
              ))
            )
              return;
            actions.sign.mutate(note.id, {
              onSuccess: () => toast(t('clinical.noteSigned')),
            });
          }}
        >
          {t('clinical.sign')}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !dirty || !body.trim()}
          onClick={() =>
            save().then(
              () => toast(t('clinical.draftSaved')),
              () => null,
            )
          }
        >
          {t('clinical.saveDraft')}
        </Button>
        <Button
          variant="ghost"
          className="text-red-700"
          disabled={busy}
          onClick={onDiscard}
        >
          {t('clinical.discard')}
        </Button>
        {dirty && (
          <span className="self-center text-xs text-amber-700">
            {t('clinical.unsaved')}
          </span>
        )}
        {isEmptyNote(body) && (
          <span className="self-center text-xs text-slate-500">
            {t('clinical.writeUnder')}
          </span>
        )}
      </div>
    </div>
  );
}

function ConfirmDiscard({
  note,
  actions,
  onClose,
}: {
  note: Note;
  actions: Actions;
  onClose: () => void;
}) {
  const toast = useToast();
  return (
    <Modal title={t('clinical.discardQ')} onClose={onClose}>
      <p className="mb-4 text-sm text-slate-600">{t('clinical.discardText')}</p>
      {actions.discard.error && (
        <Alert>{errorMessage(actions.discard.error, NOTE_ERRORS)}</Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('clinical.keep')}
        </Button>
        <Button
          className="bg-red-700 hover:bg-red-800"
          disabled={actions.discard.isPending}
          onClick={() =>
            actions.discard.mutate(note.id, {
              onSuccess: () => {
                toast(t('clinical.draftDiscarded'));
                onClose();
              },
            })
          }
        >
          {t('clinical.discard')}
        </Button>
      </div>
    </Modal>
  );
}

/** Correction: starts a new draft with the old text, plus why it's being corrected. */
function AmendDialog({
  note,
  actions,
  onClose,
}: {
  note: Note;
  actions: Actions;
  onClose: () => void;
}) {
  const [body, setBody] = useState(note.body ?? '');
  const [reason, setReason] = useState('');
  const toast = useToast();
  const valid = body.trim().length > 0 && reason.trim().length >= 3;
  return (
    <Modal title={t('clinical.amendTitle')} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t('clinical.amendText')}</p>
        <TextAreaField
          label={t('clinical.correctedText')}
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <SelectField
          label={t('common.reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={[
            { value: '', label: t('clinical.choose') },
            { value: 'Typo', label: t('clinical.rTypo') },
            { value: 'Missing information', label: t('clinical.rMissing') },
            { value: 'Wrong value', label: t('clinical.rWrong') },
            { value: 'New information', label: t('clinical.rNew') },
          ]}
        />
        {actions.amend.error && (
          <Alert>{errorMessage(actions.amend.error, NOTE_ERRORS)}</Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!valid || actions.amend.isPending}
            onClick={() =>
              actions.amend.mutate(
                { id: note.id, body, reason },
                {
                  onSuccess: () => {
                    toast(t('clinical.correctionSaved'));
                    onClose();
                  },
                },
              )
            }
          >
            {t('clinical.createCorrection')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MarkErrorDialog({
  note,
  actions,
  onClose,
}: {
  note: Note;
  actions: Actions;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const toast = useToast();
  return (
    <Modal title={t('clinical.markNoteError')} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t('clinical.markText')}</p>
        <TextAreaField
          label={t('common.reason')}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint={t('clinical.reasonHint')}
        />
        {actions.markError.error && (
          <Alert>{errorMessage(actions.markError.error, NOTE_ERRORS)}</Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            className="bg-red-700 hover:bg-red-800"
            disabled={reason.trim().length < 3 || actions.markError.isPending}
            onClick={() =>
              actions.markError.mutate(
                { id: note.id, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast(t('clinical.noteMarked'));
                    onClose();
                  },
                },
              )
            }
          >
            {t('clinical.markError')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
