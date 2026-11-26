import { useState } from 'react';
import { Button } from '@/components/Button';
import { Badge, PageHeader, QueryState, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useLabTests, useLabWorkActions, useWorklist } from './api';
import type { WorklistItem, WorklistStatus } from './api';
import { EnterResultsDialog } from './EnterResultsDialog';
import { t } from '@/i18n';

const TABS: { status: WorklistStatus; label: string }[] = [
  {
    status: 'ordered',
    get label() {
      return t('lab.toCollect');
    },
  },
  {
    status: 'collected',
    get label() {
      return t('lab.waiting');
    },
  },
];

/** The lab sees orders and patient ids only, never charts. */
export function LabPage() {
  const [status, setStatus] = useState<WorklistStatus>('ordered');
  const worklist = useWorklist(status);
  const catalog = useLabTests();
  const { collect } = useLabWorkActions();
  const toast = useToast();
  const [entering, setEntering] = useState<WorklistItem | null>(null);
  const name = (code: string) =>
    catalog.data?.find((t) => t.code === code)?.name ?? code;

  return (
    <>
      <PageHeader title={t('lab.worklist')} subtitle={t('lab.worklistSub')} />
      <div role="tablist" className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.status}
            role="tab"
            aria-selected={tab.status === status}
            onClick={() => setStatus(tab.status)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              tab.status === status
                ? 'border-teal-700 font-medium text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {collect.error && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMessage(collect.error, {
            order_not_waiting_for_collection: t('lab.alreadyCollected'),
          })}
        </div>
      )}
      <QueryState
        query={worklist}
        isEmpty={(items) => items.length === 0}
        empty={t('lab.nothing')}
      >
        {(items) => (
          <Table>
            <thead>
              <tr>
                <Th>{t('lab.priority')}</Th>
                <Th>{t('lab.tests')}</Th>
                <Th>{t('lab.orderCol')}</Th>
                <Th>{t('lab.patient')}</Th>
                <Th>{status === 'ordered' ? 'Ordered' : 'Collected'}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {items.map((o) => {
                const at =
                  status === 'ordered'
                    ? o.orderedAt
                    : (o.collectedAt ?? o.orderedAt);
                return (
                  <tr key={o.id}>
                    <Td>
                      {o.priority === 'urgent' ? (
                        <Badge tone="red">{t('lab.urgent')}</Badge>
                      ) : (
                        <Badge>{t('lab.routine')}</Badge>
                      )}
                    </Td>
                    <Td>
                      <ul>
                        {o.tests.map((code) => (
                          <li key={code}>
                            {name(code)}{' '}
                            <span className="font-mono text-xs text-slate-400">
                              {code}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Td>
                    <Td className="font-mono text-xs">{o.id.slice(-8)}</Td>
                    <Td className="font-mono text-xs">
                      {o.patientId.slice(-8)}
                    </Td>
                    <Td>
                      <div>{timeAgo(at)}</div>
                      <div className="text-xs text-slate-500">
                        {formatDateTime(at)}
                      </div>
                    </Td>
                    <Td className="text-right">
                      {status === 'ordered' ? (
                        <Button
                          variant="secondary"
                          className="py-1"
                          disabled={collect.isPending}
                          onClick={() =>
                            collect.mutate(o.id, {
                              onSuccess: () => toast(t('lab.collectedToast')),
                            })
                          }
                        >
                          {t('lab.collected')}
                        </Button>
                      ) : (
                        <Button
                          className="py-1"
                          disabled={!catalog.data}
                          onClick={() => setEntering(o)}
                        >
                          {t('lab.enterResults')}
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </QueryState>
      {entering && catalog.data && (
        <EnterResultsDialog
          order={entering}
          tests={catalog.data}
          onClose={() => setEntering(null)}
        />
      )}
    </>
  );
}
