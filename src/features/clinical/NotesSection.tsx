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

const NOTE_ERRORS = {
  stale_version: 'This draft was changed in another window. Reload the page.',
  encounter_closed: 'The visit is closed: new notes are not possible.',
  note_is_signed: 'The note is already signed. Amend it instead.',
  amendment_already_exists:
    'This note already has a correction. Amend the correction instead.',
  only_the_author_can_void: 'Only the author can mark a note as an error.',
  original_not_signed: 'The original note changed. Reload the page.',
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
        <h2 className="text-lg font-semibold">Notes</h2>
        {open && myTypes.length > 0 && !newType && (
          <div className="flex gap-2">
            {myTypes.map((t) => (
              <Button key={t} variant="secondary" onClick={() => setNewType(t)}>
                New {NOTE_TYPE_LABEL[t].toLowerCase()}
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
        empty="No notes yet."
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
                  toast('Draft saved. Sign it when it is complete.');
                  onDone();
                },
              },
            )
          }
        >
          Save draft
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
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
          Correction
          {original?.signedAt
            ? ` of the note from ${formatDateTime(original.signedAt)}`
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
        <p className="mt-2 text-xs text-slate-500">
          Replaced by a correction (see above).
        </p>
      )}
      {note.status === 'entered_in_error' && (
        <p className="mt-2 text-xs text-red-700">
          Marked as error: {note.errorReason}
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
              Amend
            </Button>
          )}
          {mine && (
            <Button
              variant="ghost"
              className="py-1 text-red-700"
              onClick={() => setDialog('error')}
            >
              Mark as error
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
  draft: { label: 'Draft', tone: 'amber' },
  signed: { label: 'Signed', tone: 'green' },
  amended: { label: 'Amended', tone: 'gray' },
  entered_in_error: { label: 'Error', tone: 'red' },
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
          ? `signed ${formatDateTime(note.signedAt)}`
          : `started ${formatDateTime(note.createdAt)}`}
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
          Correction of a signed note
          {original?.signedAt
            ? ` from ${formatDateTime(original.signedAt)}`
            : ''}
          . Reason: <em>{note.amendReason}</em>. Signing it replaces the
          original.
        </p>
      )}
      <TextAreaField
        label="Text"
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
          title={
            isEmptyNote(body) ? 'Write something before signing' : undefined
          }
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
              onSuccess: () => toast('Note signed'),
            });
          }}
        >
          Sign
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !dirty || !body.trim()}
          onClick={() =>
            save().then(
              () => toast('Draft saved'),
              () => null,
            )
          }
        >
          Save draft
        </Button>
        <Button
          variant="ghost"
          className="text-red-700"
          disabled={busy}
          onClick={onDiscard}
        >
          Discard
        </Button>
        {dirty && (
          <span className="self-center text-xs text-amber-700">
            Unsaved changes
          </span>
        )}
        {isEmptyNote(body) && (
          <span className="self-center text-xs text-slate-500">
            Write something under the headings before signing
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
    <Modal title="Discard this draft?" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-600">
        The text will be deleted. This can't be undone.
      </p>
      {actions.discard.error && (
        <Alert>{errorMessage(actions.discard.error, NOTE_ERRORS)}</Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Keep it
        </Button>
        <Button
          className="bg-red-700 hover:bg-red-800"
          disabled={actions.discard.isPending}
          onClick={() =>
            actions.discard.mutate(note.id, {
              onSuccess: () => {
                toast('Draft discarded');
                onClose();
              },
            })
          }
        >
          Discard
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
    <Modal title="Amend note" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          The signed note stays in the record. Your correction is saved as a
          draft; when you sign it, it replaces the original.
        </p>
        <TextAreaField
          label="Corrected text"
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <SelectField
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={[
            { value: '', label: 'Choose…' },
            { value: 'Typo', label: 'Typo' },
            { value: 'Missing information', label: 'Missing information' },
            { value: 'Wrong value', label: 'Wrong value' },
            { value: 'New information', label: 'New information' },
          ]}
        />
        {actions.amend.error && (
          <Alert>{errorMessage(actions.amend.error, NOTE_ERRORS)}</Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || actions.amend.isPending}
            onClick={() =>
              actions.amend.mutate(
                { id: note.id, body, reason },
                {
                  onSuccess: () => {
                    toast('Correction saved as draft');
                    onClose();
                  },
                },
              )
            }
          >
            Create correction
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
    <Modal title="Mark note as error" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          For a note that should not be in this chart (e.g. written for the
          wrong patient). It stays visible, crossed out, with your reason.
        </p>
        <TextAreaField
          label="Reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="At least 3 characters, e.g. Wrong patient"
        />
        {actions.markError.error && (
          <Alert>{errorMessage(actions.markError.error, NOTE_ERRORS)}</Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-red-700 hover:bg-red-800"
            disabled={reason.trim().length < 3 || actions.markError.isPending}
            onClick={() =>
              actions.markError.mutate(
                { id: note.id, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast('Note marked as error');
                    onClose();
                  },
                },
              )
            }
          >
            Mark as error
          </Button>
        </div>
      </div>
    </Modal>
  );
}
