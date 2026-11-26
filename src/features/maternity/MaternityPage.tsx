import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import {
  Badge,
  Card,
  Loading,
  PageHeader,
  QueryState,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { useMyPatients } from '@/features/patients/api';
import type { PatientSummary } from '@/features/patients/api';
import { useWards } from '@/features/ward/api';
import type { Ward } from '@/features/ward/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, patientName, timeAgo } from '@/lib/format';
import {
  DELIVERY_STATUS,
  useBedsOf,
  useDeliveries,
  useDeliveryActions,
} from './api';
import type { DeliveryListItem, DeliveryStatus } from './api';
import { t } from '@/i18n';

const TABS: DeliveryStatus[] = ['in_labor', 'delivered', 'cancelled'];

/** The delivery ward: who is in labor, who already gave birth, and who can start labor. */
export function MaternityPage() {
  const [status, setStatus] = useState<DeliveryStatus>('in_labor');
  const deliveries = useDeliveries(status);
  const mine = useMyPatients();
  const byId = new Map(mine.data?.map((p) => [p.id, p]));

  return (
    <>
      <PageHeader
        title={t('mat.title')}
        subtitle={t('mat.sub')}
        actions={
          <div
            role="tablist"
            className="flex gap-1 rounded-lg bg-slate-100 p-1"
          >
            {TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={tab === status}
                onClick={() => setStatus(tab)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  tab === status
                    ? 'bg-white font-medium shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {DELIVERY_STATUS[tab].label}
              </button>
            ))}
          </div>
        }
      />
      <div className="space-y-6">
        <QueryState
          query={deliveries}
          isEmpty={(items) => items.length === 0}
          empty={t('mat.noneStatus', {
            status: DELIVERY_STATUS[status].label.toLowerCase(),
          })}
        >
          {(items) => <DeliveryTable items={items} patients={byId} />}
        </QueryState>
        {status === 'in_labor' && <StartLaborCard patients={byId} />}
      </div>
    </>
  );
}

function DeliveryTable({
  items,
  patients,
}: {
  items: DeliveryListItem[];
  patients: Map<string, PatientSummary>;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>{t('mat.mother')}</Th>
          <Th>{t('mat.where')}</Th>
          <Th>{t('mat.laborStarted')}</Th>
          <Th>{t('mat.babies')}</Th>
          <Th>{t('mat.status')}</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((d) => {
          const mother = patients.get(d.motherPatientId);
          return (
            <tr key={d.id} className="hover:bg-slate-50">
              <Td>
                <Link
                  to="/maternity/$deliveryId"
                  params={{ deliveryId: d.id }}
                  className="font-medium text-teal-800 hover:underline"
                >
                  {mother ? patientName(mother) : t('mat.openDelivery')}
                </Link>
              </Td>
              <Td>
                {d.wardCode
                  ? t('mat.place', {
                      ward: d.wardCode,
                      room: d.room,
                      bed: d.bed,
                    })
                  : '—'}
              </Td>
              <Td>
                {formatDateTime(d.startedAt)}{' '}
                <span className="text-xs text-slate-500">
                  ({timeAgo(d.startedAt)})
                </span>
              </Td>
              <Td>{d.babies}</Td>
              <Td>
                <Badge tone={DELIVERY_STATUS[d.status].tone}>
                  {DELIVERY_STATUS[d.status].label}
                </Badge>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/**
 * Labor can only start for a mother lying in a DELIVERY ward (the backend checks it too:
 * 409 not_in_delivery_ward). So we list my patients in delivery-ward beds who aren't in labor.
 */
function StartLaborCard({
  patients,
}: {
  patients: Map<string, PatientSummary>;
}) {
  const wards = useWards();
  const deliveryWards: Ward[] =
    wards.data?.filter((w) => w.kind === 'delivery') ?? [];
  const boards = useBedsOf(deliveryWards);
  const inLabor = useDeliveries('in_labor');
  const { startLabor } = useDeliveryActions();
  const navigate = useNavigate();

  const loading =
    wards.isPending ||
    inLabor.isPending ||
    boards.some((b) => b.isPending) ||
    patients.size === 0;
  const busy = new Set(inLabor.data?.map((d) => d.motherPatientId));
  const candidates = boards
    .flatMap(
      (b) => b.data?.beds.map((bed) => ({ ward: b.data!.ward, bed })) ?? [],
    )
    .filter(
      ({ bed }) =>
        bed.patientId &&
        patients.has(bed.patientId) &&
        !busy.has(bed.patientId),
    );

  return (
    <Card title={t('mat.startLabor')}>
      {loading ? (
        <Loading />
      ) : candidates.length === 0 ? (
        <p className="text-sm text-slate-500">{t('mat.noneWaiting')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {candidates.map(({ ward, bed }) => (
            <li
              key={bed.bedId}
              className="flex items-center justify-between gap-4 py-2 text-sm"
            >
              <span>
                <span className="font-medium">
                  {patientName(patients.get(bed.patientId!)!)}
                </span>{' '}
                <span className="text-slate-500">
                  {t('mat.place', {
                    ward: ward.code,
                    room: bed.room,
                    bed: bed.bed,
                  })}
                </span>
              </span>
              <Button
                variant="secondary"
                disabled={startLabor.isPending}
                onClick={() =>
                  startLabor.mutate(bed.patientId!, {
                    onSuccess: (d) =>
                      void navigate({
                        to: '/maternity/$deliveryId',
                        params: { deliveryId: d.id },
                      }),
                  })
                }
              >
                {t('mat.startLabor')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {startLabor.error && (
        <div className="mt-3">
          <Alert>
            {errorMessage(startLabor.error, {
              already_in_labor: t('mat.eInLabor'),
              not_in_delivery_ward: t('mat.eNotDelivery'),
              not_admitted: t('mat.eNotAdmitted'),
            })}
          </Alert>
        </div>
      )}
    </Card>
  );
}
