import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { SelectField, TextAreaField } from '@/components/fields';
import { Modal } from '@/components/Modal';
import { Badge, QueryState } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { errorMessage } from '@/lib/errors';
import {
  DIAGNOSIS_STATUS,
  useDiagnoses,
  useDiagnosisActions,
  useIcd10Search,
} from './api';
import type { Diagnosis, DiagnosisStatus, Icd10Code } from './api';
import { t } from '@/i18n';

const DX_ERRORS = {
  get encounter_closed() {
    return t('clinical.dxClosed');
  },
  get unknown_icd10_code() {
    return t('clinical.dxUnknown');
  },
  get diagnosis_already_revised() {
    return t('clinical.dxRevised');
  },
  get diagnosis_entered_in_error() {
    return t('clinical.dxWasError');
  },
};

/** Next steps a doctor can take on a diagnosis (each one is a new version, history is kept) */
const NEXT: Record<
  DiagnosisStatus,
  { status: DiagnosisStatus; label: string }[]
> = {
  provisional: [
    {
      status: 'confirmed',
      get label() {
        return t('clinical.confirm');
      },
    },
    {
      status: 'entered_in_error',
      get label() {
        return t('clinical.markError');
      },
    },
  ],
  confirmed: [
    {
      status: 'resolved',
      get label() {
        return t('clinical.resolve');
      },
    },
    {
      status: 'entered_in_error',
      get label() {
        return t('clinical.markError');
      },
    },
  ],
  resolved: [
    {
      status: 'confirmed',
      get label() {
        return t('clinical.activeAgain');
      },
    },
  ],
  entered_in_error: [],
};

export function DiagnosesSection({
  patientId,
  encounterId,
  open,
  canDiagnose,
}: {
  patientId: string;
  encounterId: string;
  open: boolean;
  canDiagnose: boolean;
}) {
  const diagnoses = useDiagnoses(patientId);
  const actions = useDiagnosisActions(patientId);
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('clinical.diagnoses')}</h2>
        {open && canDiagnose && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {t('clinical.addDiagnosis')}
          </Button>
        )}
      </div>
      {actions.revise.error && (
        <Alert>{errorMessage(actions.revise.error, DX_ERRORS)}</Alert>
      )}
      <QueryState
        query={diagnoses}
        isEmpty={(d) => !d.some((x) => x.encounterId === encounterId)}
        empty={t('clinical.noDxVisit')}
      >
        {(items) => (
          <ul className="space-y-2">
            {items
              .filter((d) => d.encounterId === encounterId)
              .sort((a, b) =>
                a.rank === b.rank ? 0 : a.rank === 'primary' ? -1 : 1,
              )
              .map((d) => (
                <DiagnosisItem
                  key={d.id}
                  diagnosis={d}
                  canRevise={canDiagnose}
                  busy={actions.revise.isPending}
                  onRevise={(status) =>
                    actions.revise.mutate(
                      { id: d.id, status },
                      {
                        onSuccess: () =>
                          toast(
                            t('clinical.dxChanged', {
                              status:
                                DIAGNOSIS_STATUS[status].label.toLowerCase(),
                            }),
                          ),
                      },
                    )
                  }
                />
              ))}
          </ul>
        )}
      </QueryState>
      {adding && (
        <AddDiagnosisDialog
          encounterId={encounterId}
          actions={actions}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}

function DiagnosisItem({
  diagnosis: d,
  canRevise,
  busy,
  onRevise,
}: {
  diagnosis: Diagnosis;
  canRevise: boolean;
  busy: boolean;
  onRevise: (status: DiagnosisStatus) => void;
}) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-mono text-xs text-slate-500">
            {d.icd10Code}
          </span>{' '}
          <span className="font-medium">{d.icd10Title}</span>
          <div className="text-xs text-slate-500">
            {d.rank === 'primary' ? 'Primary' : 'Secondary'}
          </div>
        </div>
        <Badge tone={DIAGNOSIS_STATUS[d.status].tone}>
          {DIAGNOSIS_STATUS[d.status].label}
        </Badge>
      </div>
      {d.note && <p className="mt-1 text-slate-600">{d.note}</p>}
      {canRevise && NEXT[d.status].length > 0 && (
        <div className="mt-2 flex gap-2">
          {NEXT[d.status].map((n) => (
            <Button
              key={n.status}
              variant="ghost"
              className={`py-1 ${n.status === 'entered_in_error' ? 'text-red-700' : ''}`}
              disabled={busy}
              onClick={() => onRevise(n.status)}
            >
              {n.label}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}

function AddDiagnosisDialog({
  encounterId,
  actions,
  onClose,
}: {
  encounterId: string;
  actions: ReturnType<typeof useDiagnosisActions>;
  onClose: () => void;
}) {
  const [code, setCode] = useState<Icd10Code | null>(null);
  const [rank, setRank] = useState<'primary' | 'secondary'>('primary');
  const [status, setStatus] = useState<'provisional' | 'confirmed'>(
    'provisional',
  );
  const [note, setNote] = useState('');
  const toast = useToast();

  return (
    <Modal title={t('clinical.addDiagnosis')} onClose={onClose}>
      <div className="space-y-4">
        {code ? (
          <div className="flex items-center justify-between rounded-md border border-teal-300 bg-teal-50 px-3 py-2 text-sm">
            <span>
              <span className="font-mono">{code.code}</span> {code.title}
            </span>
            <Button
              variant="ghost"
              className="py-1"
              onClick={() => setCode(null)}
            >
              {t('clinical.change')}
            </Button>
          </div>
        ) : (
          <Icd10Picker onPick={setCode} />
        )}
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label={t('clinical.rank')}
            value={rank}
            onChange={(e) => setRank(e.target.value as typeof rank)}
            options={[
              { value: 'primary', label: t('clinical.primary') },
              { value: 'secondary', label: t('clinical.secondary') },
            ]}
          />
          <SelectField
            label={t('clinical.certainty')}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            options={[
              { value: 'provisional', label: t('clinical.dxProvisional') },
              { value: 'confirmed', label: t('clinical.dxConfirmed') },
            ]}
          />
        </div>
        <TextAreaField
          label={t('clinical.noteOptional')}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {actions.add.error && (
          <Alert>{errorMessage(actions.add.error, DX_ERRORS)}</Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!code || actions.add.isPending}
            onClick={() =>
              code &&
              actions.add.mutate(
                {
                  encounterId,
                  icd10Code: code.code,
                  rank,
                  status,
                  note: note.trim() || null,
                },
                {
                  onSuccess: () => {
                    toast(t('clinical.added', { code: code.code }));
                    onClose();
                  },
                },
              )
            }
          >
            {t('clinical.add')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Search the ICD-10 catalog by code ("J18") or words ("pneumonia") and pick one. */
function Icd10Picker({ onPick }: { onPick: (code: Icd10Code) => void }) {
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), 250);
  const results = useIcd10Search(q);
  return (
    <div className="space-y-2">
      <label
        className="block text-sm font-medium text-slate-700"
        htmlFor="icd10-search"
      >
        ICD-10 code or name
      </label>
      <input
        id="icd10-search"
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('clinical.icdPh')}
        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 focus:outline-none"
      />
      {q.length >= 2 && (
        <QueryState
          query={results}
          isEmpty={(r) => r.length === 0}
          empty={t('clinical.noCode')}
        >
          {(items) => (
            <ul
              aria-label={t('clinical.icdResults')}
              className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200"
            >
              {items.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => onPick(c)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-teal-50 focus:bg-teal-50 focus:outline-none"
                  >
                    <span className="font-mono text-xs text-slate-500">
                      {c.code}
                    </span>{' '}
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      )}
    </div>
  );
}
