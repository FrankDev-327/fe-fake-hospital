import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Badge, PageHeader, QueryState } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { formatDay, formatTime, isoDay, patientName } from '@/lib/format';
import { STATUS, useDoctors, useSchedule, VISIT_LABEL } from './api';
import type { Appointment } from './api';
import { t } from '@/i18n';

const DAYS_SHOWN = 7;

/** Doctor: own week. Front desk: pick a doctor. */
export function AppointmentsPage() {
  const { state } = useAuth();
  const user = state.user!;
  const isDoctor = user.role === 'doctor';
  const doctors = useDoctors(!isDoctor);
  const [picked, setPicked] = useState<string>();
  const doctorId = isDoctor ? user.id : (picked ?? doctors.data?.[0]?.id);

  const now = useNow();
  const from = isoDay(new Date(now));
  const to = isoDay(new Date(now + (DAYS_SHOWN - 1) * 86_400_000));
  const schedule = useSchedule(doctorId, from, to);

  return (
    <>
      <PageHeader
        title={isDoctor ? t('appt.mine') : t('appt.title')}
        subtitle={t('appt.next', { days: DAYS_SHOWN })}
        actions={
          !isDoctor &&
          doctors.data && (
            <label className="text-sm">
              <span className="mr-2 text-slate-600">{t('appt.doctor')}</span>
              <select
                value={doctorId}
                onChange={(e) => setPicked(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2"
              >
                {doctors.data.map((d) => (
                  <option key={d.id} value={d.id}>
                    {t('common.dr')} {d.firstName} {d.lastName}
                  </option>
                ))}
              </select>
            </label>
          )
        }
      />
      <QueryState
        query={schedule}
        isEmpty={(items) => items.length === 0}
        empty={t('appt.none')}
      >
        {(items) => <Schedule items={items} />}
      </QueryState>
    </>
  );
}

function Schedule({ items }: { items: Appointment[] }) {
  // group by day (Map keeps insertion order, and the list is sorted by time)
  const days = new Map<string, Appointment[]>();
  for (const a of items) {
    const day = formatDay(a.startsAt);
    days.set(day, [...(days.get(day) ?? []), a]);
  }
  return (
    <div className="space-y-6">
      {[...days].map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{day}</h2>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {list.map((a) => (
              <li
                key={a.id}
                className={`flex items-center gap-4 px-4 py-3 text-sm ${
                  a.status === 'cancelled' ? 'text-slate-400 line-through' : ''
                }`}
              >
                <span className="w-24 font-mono">
                  {formatTime(a.startsAt)}–{formatTime(a.endsAt)}
                </span>
                <span className="flex-1 font-medium">
                  {patientName(a.patient)}
                </span>
                <span className="font-mono text-xs text-slate-500">
                  {a.patient.mrn}
                </span>
                <span className="w-28 text-slate-600">
                  {VISIT_LABEL[a.visitType]}
                </span>
                <Badge tone={STATUS[a.status].tone}>
                  {STATUS[a.status].label}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
