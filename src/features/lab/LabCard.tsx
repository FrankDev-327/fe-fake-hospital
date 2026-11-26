import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/Button';
import { Badge, Card, QueryState } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { StaffName } from '@/features/staff/StaffName';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import {
  FLAG,
  ORDER_STATUS,
  rangeText,
  useLabActions,
  useLabOrders,
} from './api';
import type { LabOrder, LabResult } from './api';
import { OrderLabDialog } from './OrderLabDialog';
import { t } from '@/i18n';

const LAB_ERRORS = {
  get order_not_waiting_for_collection() {
    return t('lab.eCollected');
  },
  get order_closed() {
    return t('lab.eClosed');
  },
  get order_has_results() {
    return t('lab.eHasResults');
  },
  get already_acknowledged() {
    return t('lab.eAcked');
  },
};

/** The patient's lab orders and results. Critical results stay red until a doctor acknowledges. */
export function LabCard({
  patientId,
  openEncounterId,
}: {
  patientId: string;
  openEncounterId?: string;
}) {
  const orders = useLabOrders(patientId);
  const actions = useLabActions(patientId);
  const { state } = useAuth();
  const isDoctor = state.user?.role === 'doctor';
  const [ordering, setOrdering] = useState(false);
  const error =
    actions.collect.error ?? actions.cancel.error ?? actions.acknowledge.error;

  return (
    <Card
      title={
        <span className="flex items-center justify-between">
          {t('lab.lab')}
          {isDoctor && openEncounterId && (
            <Button className="py-1" onClick={() => setOrdering(true)}>
              {t('lab.order')}
            </Button>
          )}
        </span>
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMessage(error, LAB_ERRORS)}
        </div>
      )}
      <QueryState
        query={orders}
        isEmpty={(o) => o.length === 0}
        empty={t('lab.noOrders')}
      >
        {(items) => {
          const unacked = items
            .flatMap((o) => o.results)
            .filter((r) => r.critical && !r.acknowledged);
          return (
            <div className="space-y-4">
              {unacked.length > 0 && (
                <div
                  role="alert"
                  className="rounded-md border-2 border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900"
                >
                  {t(
                    unacked.length === 1
                      ? 'lab.critWaiting_one'
                      : 'lab.critWaiting_other',
                    { count: unacked.length },
                  )}
                </div>
              )}
              {items.map((o) => (
                <OrderItem
                  key={o.id}
                  order={o}
                  patientId={patientId}
                  isDoctor={isDoctor}
                  actions={actions}
                />
              ))}
            </div>
          );
        }}
      </QueryState>
      {ordering && openEncounterId && (
        <OrderLabDialog
          patientId={patientId}
          encounterId={openEncounterId}
          onClose={() => setOrdering(false)}
        />
      )}
    </Card>
  );
}

function OrderItem({
  order: o,
  isDoctor,
  actions,
}: {
  order: LabOrder;
  patientId: string;
  isDoctor: boolean;
  actions: ReturnType<typeof useLabActions>;
}) {
  const toast = useToast();
  const resultFor = (code: string) =>
    o.results.find((r) => r.testCode === code);
  const canCancel =
    isDoctor &&
    (o.status === 'ordered' || o.status === 'collected') &&
    !o.results.length;
  return (
    <section className="rounded-lg border border-slate-200">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm">
        <Badge tone={ORDER_STATUS[o.status].tone}>
          {ORDER_STATUS[o.status].label}
        </Badge>
        {o.priority === 'urgent' && <Badge tone="red">{t('lab.urgent')}</Badge>}
        <span className="text-slate-500">
          {formatDateTime(o.orderedAt)} · <StaffName id={o.orderedBy} />
        </span>
        <span className="ml-auto flex gap-1">
          {o.status === 'ordered' && (
            <Button
              variant="secondary"
              className="py-1"
              disabled={actions.collect.isPending}
              onClick={() =>
                actions.collect.mutate(o.id, {
                  onSuccess: () => toast(t('lab.collectedToast')),
                })
              }
            >
              {t('lab.sampleTaken')}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="ghost"
              className="py-1"
              disabled={actions.cancel.isPending}
              onClick={() =>
                actions.cancel.mutate(o.id, {
                  onSuccess: () => toast(t('lab.cancelledToast')),
                })
              }
            >
              {t('common.cancel')}
            </Button>
          )}
        </span>
      </header>
      <table className="w-full text-sm">
        <tbody>
          {o.tests.map((test) => {
            const r = resultFor(test.code);
            const alarm = r?.critical && !r.acknowledged;
            return (
              <tr
                key={test.code}
                className={`border-b border-slate-50 last:border-0 ${alarm ? 'bg-red-50' : ''}`}
              >
                <td className="px-3 py-2">{test.name}</td>
                <td className="px-3 py-2 font-medium">
                  {r ? (
                    (r.value ?? r.valueText)
                  ) : (
                    <span className="font-normal text-slate-400">—</span>
                  )}{' '}
                  {r && (
                    <span className="font-normal text-slate-500">
                      {test.unit}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {rangeText(test)} {rangeText(test) && test.unit}
                </td>
                <td className="px-3 py-2 text-right">
                  {r && <ResultFlag result={r} />}{' '}
                  {alarm && isDoctor && (
                    <Button
                      className="ml-2 bg-red-700 py-1 hover:bg-red-800"
                      disabled={actions.acknowledge.isPending}
                      onClick={() =>
                        actions.acknowledge.mutate(r.id, {
                          onSuccess: () => toast(t('lab.ackToast')),
                        })
                      }
                    >
                      {t('lab.acknowledge')}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function ResultFlag({ result }: { result: LabResult }) {
  const flag = result.flag ? FLAG[result.flag] : null;
  return (
    <>
      {flag && <Badge tone={flag.tone}>{flag.label}</Badge>}
      {result.critical && result.acknowledged && (
        <span className="ml-1 text-xs text-slate-500">{t('lab.seen')}</span>
      )}
    </>
  );
}
