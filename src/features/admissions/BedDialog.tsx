import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { SelectField, TextAreaField } from '@/components/fields';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/toast-context';
import { useBedBoard, useWards } from '@/features/ward/api';
import { errorMessage } from '@/lib/errors';
import { useAdmissionActions } from './api';
import { t } from '@/i18n';

const ERRORS = () => ({
  bed_not_free: t('adm.errBedTaken'),
  already_admitted: t('adm.errAlready'),
  encounter_not_open: t('adm.errVisitClosed'),
  admission_not_active: t('adm.errNotActive'),
});

/**
 * Admit (pick a bed for a patient's open hospital visit) or transfer (move to another free bed).
 * Ward first, then one of its free beds; the board for that ward is the same query the
 * ward page uses, so it's usually cached already.
 */
export function BedDialog({
  patientId,
  mode,
  encounterId,
  admissionId,
  currentBedId,
  onClose,
}: {
  patientId: string;
  onClose: () => void;
} & (
  | {
      mode: 'admit';
      encounterId: string;
      admissionId?: never;
      currentBedId?: never;
    }
  | {
      mode: 'transfer';
      admissionId: string;
      currentBedId?: string;
      encounterId?: never;
    }
)) {
  const toast = useToast();
  const { admit, transfer } = useAdmissionActions(patientId);
  const wards = useWards();
  const [wardId, setWardId] = useState('');
  const [bedId, setBedId] = useState('');
  const [reason, setReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const board = useBedBoard(wardId || undefined);
  const free =
    board.data?.beds.filter(
      (b) => b.state === 'free' && b.bedId !== currentBedId,
    ) ?? [];
  const action = mode === 'admit' ? admit : transfer;

  const submit = () => {
    setShowErrors(true);
    if (!bedId) return;
    const done = () => {
      toast(mode === 'admit' ? t('adm.admitted') : t('adm.moved'));
      onClose();
    };
    if (mode === 'admit')
      admit.mutate({ encounterId, bedId }, { onSuccess: done });
    else
      transfer.mutate(
        { id: admissionId, bedId, reason: reason.trim() || null },
        { onSuccess: done },
      );
  };

  return (
    <Modal
      title={mode === 'admit' ? t('adm.admitTitle') : t('adm.moveTitle')}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <SelectField
          label={t('adm.ward')}
          value={wardId}
          onChange={(e) => {
            setWardId(e.target.value);
            setBedId('');
          }}
          options={[
            { value: '', label: t('adm.chooseWard') },
            ...(wards.data?.map((w) => ({ value: w.id, label: w.name })) ?? []),
          ]}
        />
        <SelectField
          label={t('adm.bed')}
          value={bedId}
          disabled={!wardId || board.isPending}
          onChange={(e) => setBedId(e.target.value)}
          error={showErrors && !bedId ? t('adm.chooseBedErr') : undefined}
          hint={
            wardId && board.data
              ? t('adm.freeHint', { n: free.length })
              : undefined
          }
          options={[
            { value: '', label: t('adm.chooseBed') },
            ...free.map((b) => ({
              value: b.bedId,
              label: t('adm.bedLabel', { room: b.room, bed: b.bed }),
            })),
          ]}
        />
        {mode === 'transfer' && (
          <TextAreaField
            label={t('adm.reason')}
            hint={t('adm.reasonHint')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        )}
        {action.error && <Alert>{errorMessage(action.error, ERRORS())}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={action.isPending}>
            {mode === 'admit' ? t('adm.admit') : t('adm.move')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
