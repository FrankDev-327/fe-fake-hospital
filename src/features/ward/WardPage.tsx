import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Badge, PageHeader, QueryState } from '@/components/ui';
import { useMyPatients } from '@/features/patients/api';
import type { PatientSummary } from '@/features/patients/api';
import { patientName, timeAgo } from '@/lib/format';
import { useBedBoard, useWards } from './api';
import type { Bed } from './api';
import { t } from '@/i18n';

export function WardPage() {
  const wards = useWards();
  const [picked, setPicked] = useState<string>();
  const wardId = picked ?? wards.data?.[0]?.id;
  const board = useBedBoard(wardId);
  // the board only has patient ids; names come from "my patients" (already cached)
  const mine = useMyPatients();
  const byId = new Map(mine.data?.map((p) => [p.id, p]));

  return (
    <>
      <PageHeader
        title={t('ward.title')}
        subtitle={t('ward.sub')}
        actions={
          wards.data && (
            <div
              role="tablist"
              className="flex gap-1 rounded-lg bg-slate-100 p-1"
            >
              {wards.data.map((w) => (
                <button
                  key={w.id}
                  role="tab"
                  aria-selected={w.id === wardId}
                  onClick={() => setPicked(w.id)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    w.id === wardId
                      ? 'bg-white font-medium shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {w.name}
                </button>
              ))}
            </div>
          )
        }
      />
      <QueryState query={board}>
        {({ beds }) => <BedGrid beds={beds} patients={byId} />}
      </QueryState>
    </>
  );
}

function BedGrid({
  beds,
  patients,
}: {
  beds: Bed[];
  patients: Map<string, PatientSummary>;
}) {
  const free = beds.filter((b) => b.state === 'free').length;
  const rooms = [...new Set(beds.map((b) => b.room))];
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {t('ward.freeOf', {
          free,
          total: beds.filter((b) => b.state !== 'out_of_service').length,
        })}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rooms.map((room) => (
          <section
            key={room}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {t('ward.room', { room })}
            </h2>
            <ul className="space-y-2">
              {beds
                .filter((b) => b.room === room)
                .map((b) => (
                  <BedCard
                    key={b.bedId}
                    bed={b}
                    patient={
                      b.patientId ? patients.get(b.patientId) : undefined
                    }
                  />
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function BedCard({ bed, patient }: { bed: Bed; patient?: PatientSummary }) {
  const tone =
    bed.state === 'free'
      ? 'border-emerald-200 bg-emerald-50'
      : bed.state === 'out_of_service'
        ? 'border-slate-200 bg-slate-100 text-slate-400'
        : patient
          ? 'border-teal-300 bg-teal-50'
          : 'border-slate-200 bg-slate-50';
  return (
    <li className={`rounded-md border px-3 py-2 text-sm ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">{t('ward.bed', { bed: bed.bed })}</span>
        {bed.state === 'free' && <Badge tone="green">{t('ward.free')}</Badge>}
        {bed.state === 'out_of_service' && <Badge>{t('ward.oos')}</Badge>}
        {bed.state === 'occupied' && !patient && (
          <Badge>{t('ward.occupied')}</Badge>
        )}
      </div>
      {patient && bed.patientId && (
        <div className="mt-1">
          <Link
            to="/patients/$patientId"
            params={{ patientId: bed.patientId }}
            className="font-medium text-teal-800 hover:underline"
          >
            {patientName(patient)}
          </Link>
          {bed.since && (
            <div className="text-xs text-slate-500">
              {t('ward.admitted', { ago: timeAgo(bed.since) })}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
