import { useState } from 'react';
import { Button } from '@/components/Button';
import { Badge, PageHeader, QueryState, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useLabTests, useLabWorkActions, useWorklist } from './api';
import type { WorklistItem, WorklistStatus } from './api';
import { EnterResultsDialog } from './EnterResultsDialog';

const TABS: { status: WorklistStatus; label: string }[] = [
  { status: 'ordered', label: 'To collect' },
  { status: 'collected', label: 'Collected, waiting for results' },
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
      <PageHeader
        title="Lab worklist"
        subtitle="Urgent first, then oldest first"
      />
      <div role="tablist" className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.status}
            role="tab"
            aria-selected={t.status === status}
            onClick={() => setStatus(t.status)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              t.status === status
                ? 'border-teal-700 font-medium text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {collect.error && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMessage(collect.error, {
            order_not_waiting_for_collection:
              'Already collected (maybe on the ward).',
          })}
        </div>
      )}
      <QueryState
        query={worklist}
        isEmpty={(items) => items.length === 0}
        empty="Nothing here."
      >
        {(items) => (
          <Table>
            <thead>
              <tr>
                <Th>Priority</Th>
                <Th>Tests</Th>
                <Th>Order</Th>
                <Th>Patient</Th>
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
                        <Badge tone="red">Urgent</Badge>
                      ) : (
                        <Badge>Routine</Badge>
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
                              onSuccess: () => toast('Sample collected'),
                            })
                          }
                        >
                          Collected
                        </Button>
                      ) : (
                        <Button
                          className="py-1"
                          disabled={!catalog.data}
                          onClick={() => setEntering(o)}
                        >
                          Enter results
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
