import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { Badge } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { errorMessage } from '@/lib/errors';
import { FLAG, flagFor, rangeText, useLabWorkActions } from './api';
import type { LabTest, WorklistItem } from './api';
import { t } from '@/i18n';

/** Lab tech: type the values of a collected order. The flag shows while typing. */
export function EnterResultsDialog({
  order,
  tests,
  onClose,
}: {
  order: WorklistItem;
  tests: LabTest[];
  onClose: () => void;
}) {
  const { enterResults } = useLabWorkActions();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const parsed = order.tests.map((code) => {
    const raw = values[code]?.trim().replace(',', '.') ?? '';
    return {
      code,
      test: tests.find((t) => t.code === code),
      raw,
      value: Number(raw),
    };
  });
  const filled = parsed.filter((p) => p.raw !== '');
  const invalid = filled.some((p) => Number.isNaN(p.value));

  return (
    <Modal
      title={t('lab.resultsTitle', { id: order.id.slice(-8) })}
      onClose={onClose}
    >
      <div className="space-y-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase">
              <th className="pb-2">{t('lab.test')}</th>
              <th className="pb-2">{t('lab.value')}</th>
              <th className="pb-2">{t('lab.normal')}</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {parsed.map(({ code, test, raw, value }) => {
              const flag =
                test && raw !== '' && !Number.isNaN(value)
                  ? FLAG[flagFor(test, value)]
                  : null;
              const id = `result-${code}`;
              return (
                <tr key={code}>
                  <td className="py-1 pr-2">
                    <label htmlFor={id}>{test?.name ?? code}</label>
                  </td>
                  <td className="py-1 pr-2">
                    <div className="flex items-center gap-1">
                      <input
                        id={id}
                        inputMode="decimal"
                        value={values[code] ?? ''}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [code]: e.target.value }))
                        }
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 focus:outline-none"
                      />
                      <span className="text-xs text-slate-500">
                        {test?.unit}
                      </span>
                    </div>
                  </td>
                  <td className="py-1 pr-2 text-xs text-slate-400">
                    {test && rangeText(test)}
                  </td>
                  <td className="py-1">
                    {flag && <Badge tone={flag.tone}>{flag.label}</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-slate-500">{t('lab.leaveEmpty')}</p>
        {enterResults.error && (
          <Alert>
            {errorMessage(enterResults.error, {
              order_not_collected: t('lab.notCollected'),
              result_already_entered:
                'A result was already entered for one of these tests.',
            })}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!filled.length || invalid || enterResults.isPending}
            onClick={() =>
              enterResults.mutate(
                {
                  orderId: order.id,
                  results: filled.map((p) => ({
                    testCode: p.code,
                    value: p.value,
                  })),
                },
                {
                  onSuccess: ({ results }) => {
                    const critical = results.filter((r) => r.critical).length;
                    toast(
                      t(
                        results.length === 1
                          ? 'lab.resSaved_one'
                          : 'lab.resSaved_other',
                        { count: results.length },
                      ) +
                        (critical
                          ? t('lab.critAlert', { count: critical })
                          : ''),
                    );
                    onClose();
                  },
                },
              )
            }
          >
            {t('lab.saveResults')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
