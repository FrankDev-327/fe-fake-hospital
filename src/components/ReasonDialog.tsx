import { useState } from 'react';
import type { ReactNode } from 'react';
import { Alert } from './Alert';
import { Button } from './Button';
import { TextAreaField } from './fields';
import { Modal } from './Modal';
import { t } from '@/i18n';

/** "Are you sure? Write why." Used for stop, mark as error, cancel... (the reason is recorded) */
export function ReasonDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        {children && <div className="text-sm text-slate-600">{children}</div>}
        <TextAreaField
          label={t('common.reason')}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint={t('common.min3')}
        />
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.back')}
          </Button>
          <Button
            className={danger ? 'bg-red-700 hover:bg-red-800' : ''}
            disabled={reason.trim().length < 3 || pending}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
