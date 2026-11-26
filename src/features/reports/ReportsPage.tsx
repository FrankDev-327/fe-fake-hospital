import { useState } from 'react';
import {
  Card,
  ErrorMessage,
  Loading,
  PageHeader,
  QueryState,
} from '@/components/ui';
import { useLabTests } from '@/features/lab/api';
import { useWards } from '@/features/ward/api';
import { useNow } from '@/hooks/useNow';
import { t } from '@/i18n';
import { isoDay } from '@/lib/format';
import {
  bucketFor,
  periodDays,
  previousPeriod,
  sum,
  sumByBucket,
  useAdmissionFlow,
  useAppointmentStats,
  useCriticalResults,
  useDiagnosisCounts,
  useOccupancy,
  useTopMedication,
  useTrends,
} from './api';
import type { Period } from './api';
import { bucketLabel, formatNumber } from './chart-format';
import { ChartCard, RankChart, TimeChart } from './charts';

const PRESETS = [7, 30, 90, 365] as const;
const MAX_DAYS = 366; // same limit as the backend's PeriodQuery

/**
 * Hospital dashboard: numbers only (the reporting service has no patient data).
 * One filter row on top (period + ward) drives every chart below.
 */
export function ReportsPage() {
  const now = useNow();
  const today = isoDay(new Date(now));
  const daysAgo = (n: number) => isoDay(new Date(now - n * 86_400_000));
  /** "Last year" starts on the 1st of a month, so the monthly chart has no cut-off first month */
  const presetFrom = (n: number) =>
    n === 365
      ? `${isoDay(new Date(new Date(now).setMonth(new Date(now).getMonth() - 11))).slice(0, 7)}-01`
      : daysAgo(n - 1);

  const [period, setPeriod] = useState<Period>(() => ({
    from: daysAgo(29),
    to: today,
  }));
  const [ward, setWard] = useState('');
  const valid =
    period.from <= period.to &&
    periodDays(period) <= MAX_DAYS &&
    period.to <= today;

  return (
    <>
      <PageHeader title={t('reports.title')} subtitle={t('reports.sub')} />
      <Filters
        period={period}
        ward={ward}
        today={today}
        presetFrom={presetFrom}
        onPreset={(n) => setPeriod({ from: presetFrom(n), to: today })}
        onPeriod={setPeriod}
        onWard={setWard}
      />
      {valid ? (
        <Dashboard period={period} ward={ward} />
      ) : (
        <p role="alert" className="text-sm text-red-700">
          {t('reports.badPeriod', { max: MAX_DAYS })}
        </p>
      )}
    </>
  );
}

function Filters({
  period,
  ward,
  today,
  presetFrom,
  onPreset,
  onPeriod,
  onWard,
}: {
  period: Period;
  ward: string;
  today: string;
  presetFrom: (days: number) => string;
  onPreset: (days: number) => void;
  onPeriod: (p: Period) => void;
  onWard: (code: string) => void;
}) {
  const wards = useWards();
  const input =
    'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm';
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div role="group" aria-label={t('reports.period')} className="flex gap-1">
        {PRESETS.map((n) => {
          const active = period.to === today && period.from === presetFrom(n);
          return (
            <button
              key={n}
              aria-pressed={active}
              onClick={() => onPreset(n)}
              className={`rounded-md px-3 py-1.5 text-sm ${active ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {n === 365 ? t('reports.year') : t('reports.lastDays', { n })}
            </button>
          );
        })}
      </div>
      <label className="text-sm text-slate-600">
        <span className="mb-1 block">{t('reports.from')}</span>
        <input
          type="date"
          value={period.from}
          max={today}
          onChange={(e) =>
            e.target.value && onPeriod({ ...period, from: e.target.value })
          }
          className={input}
        />
      </label>
      <label className="text-sm text-slate-600">
        <span className="mb-1 block">{t('reports.to')}</span>
        <input
          type="date"
          value={period.to}
          max={today}
          onChange={(e) =>
            e.target.value && onPeriod({ ...period, to: e.target.value })
          }
          className={input}
        />
      </label>
      <label className="text-sm text-slate-600">
        <span className="mb-1 block">{t('reports.ward')}</span>
        <select
          value={ward}
          onChange={(e) => onWard(e.target.value)}
          className={input}
        >
          <option value="">{t('reports.allWards')}</option>
          {wards.data?.map((w) => (
            <option key={w.id} value={w.code}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Dashboard({ period, ward }: { period: Period; ward: string }) {
  const bucket = bucketFor(period);
  const days = periodDays(period);
  const compare = days <= 183; // the period before must still be inside the history
  const trends = useTrends(period, ward);
  const before = useTrends(previousPeriod(period), ward, compare);
  const flow = useAdmissionFlow(period);
  const meds = useTopMedication(period);
  const diagnoses = useDiagnosisCounts(period);
  const critical = useCriticalResults(period);
  const appointments = useAppointmentStats(period);
  const catalog = useLabTests();
  const testName = (code: string) =>
    catalog.data?.find((x) => x.code === code)?.name ?? code;

  if (trends.isPending) return <Loading />;
  if (trends.error) return <ErrorMessage error={trends.error} />;
  const tr = trends.data;
  const prev = compare ? before.data?.days : undefined;
  const series = sumByBucket(tr.days, bucket);
  const dayCol = {
    label: t(`reports.bucket_${bucket}`),
    value: (r: { day: string }) => bucketLabel(r.day, bucket),
  };
  const num = (key: string, label: string) => ({
    label,
    numeric: true,
    value: (r: Record<string, number | string>) =>
      formatNumber(Number(r[key] ?? 0)),
  });

  const total = (pick: (d: (typeof tr.days)[number]) => number) => ({
    value: sum(tr.days, pick),
    before: prev ? sum(prev, pick) : undefined,
  });
  const stays = flow.data?.wards.filter(
    (w) => (!ward || w.code === ward) && w.avgLengthOfStayDays !== null,
  );
  const avgStay =
    stays && sum(stays, (w) => w.discharges)
      ? sum(stays, (w) => w.avgLengthOfStayDays! * w.discharges) /
        sum(stays, (w) => w.discharges)
      : null;

  const criticalByBucket = sumByBucket(
    (critical.data?.days ?? []).map((d) => ({
      day: d.day,
      count: d.count === '<5' ? 0 : d.count,
    })),
    bucket,
  );
  const appt = appointments.data?.doctors[0];

  return (
    <div className="space-y-6" aria-busy={trends.isFetching}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label={t('reports.kAdmissions')} {...total((d) => d.admissions)} />
        <Kpi label={t('reports.kDischarges')} {...total((d) => d.discharges)} />
        <Kpi
          label={t('reports.kStay')}
          value={avgStay}
          format={(n) => t('reports.daysValue', { n: n.toFixed(1) })}
        />
        <Kpi
          label={t('reports.kBirths')}
          {...total((d) => d.birthsFemale + d.birthsMale)}
        />
        <Kpi
          label={t('reports.kNewPatients')}
          {...total((d) => d.newPatients)}
        />
        <Kpi label={t('reports.kDoses')} {...total((d) => d.dosesGiven)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          className="lg:col-span-2"
          title={t('reports.flowTitle')}
          subtitle={t(`reports.per_${bucket}`)}
          rows={series}
          columns={[
            dayCol,
            num('admissions', t('reports.kAdmissions')),
            num('discharges', t('reports.kDischarges')),
          ]}
        >
          <TimeChart
            kind="line"
            bucket={bucket}
            data={series}
            series={[
              { key: 'admissions', label: t('reports.kAdmissions') },
              { key: 'discharges', label: t('reports.kDischarges') },
            ]}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.birthsTitle')}
          subtitle={t('reports.birthsSub')}
          rows={series}
          columns={[
            dayCol,
            num('birthsFemale', t('reports.girls')),
            num('birthsMale', t('reports.boys')),
          ]}
        >
          <TimeChart
            kind="bar"
            bucket={bucket}
            data={series}
            series={[
              { key: 'birthsFemale', label: t('reports.girls') },
              { key: 'birthsMale', label: t('reports.boys') },
            ]}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.newPatientsTitle')}
          subtitle={t('reports.newPatientsSub')}
          rows={series}
          columns={[dayCol, num('newPatients', t('reports.kNewPatients'))]}
        >
          <TimeChart
            kind="bar"
            bucket={bucket}
            data={series}
            series={[{ key: 'newPatients', label: t('reports.kNewPatients') }]}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.ageTitle')}
          subtitle={t('reports.ageSub')}
          rows={tr.ageGroups}
          columns={[
            { label: t('reports.ageGroup'), value: (r) => r.group },
            {
              label: t('reports.kAdmissions'),
              numeric: true,
              value: (r) => formatNumber(r.count),
            },
          ]}
        >
          <RankChart
            vertical={false}
            name={t('reports.kAdmissions')}
            data={tr.ageGroups.map((a) => ({ label: a.group, value: a.count }))}
          />
        </ChartCard>

        <QueryState query={flow}>
          {(f) => (
            <ChartCard
              title={t('reports.wardTitle')}
              subtitle={t('reports.wardSub')}
              rows={f.wards}
              columns={[
                { label: t('reports.ward'), value: (r) => r.name },
                {
                  label: t('reports.kAdmissions'),
                  numeric: true,
                  value: (r) => formatNumber(r.admissions),
                },
                {
                  label: t('reports.kDischarges'),
                  numeric: true,
                  value: (r) => formatNumber(r.discharges),
                },
                {
                  label: t('reports.kStay'),
                  numeric: true,
                  value: (r) => r.avgLengthOfStayDays ?? '—',
                },
              ]}
            >
              <RankChart
                name={t('reports.kAdmissions')}
                data={f.wards.map((w) => ({
                  label: w.name,
                  value: w.admissions,
                }))}
              />
            </ChartCard>
          )}
        </QueryState>

        <QueryState query={meds}>
          {(m) => (
            <ChartCard
              title={t('reports.medsTitle')}
              subtitle={t('reports.medsSub')}
              rows={m.drugs}
              columns={[
                { label: t('reports.drug'), value: (r) => r.name },
                {
                  label: t('reports.kDoses'),
                  numeric: true,
                  value: (r) => formatNumber(r.dosesGiven),
                },
              ]}
            >
              <RankChart
                name={t('reports.kDoses')}
                data={m.drugs.map((d) => ({
                  label: d.name,
                  value: d.dosesGiven,
                }))}
              />
            </ChartCard>
          )}
        </QueryState>

        <ChartCard
          title={t('reports.notGivenTitle')}
          subtitle={t('reports.notGivenSub')}
          rows={series}
          columns={[
            dayCol,
            num('dosesSkipped', t('reports.skipped')),
            num('dosesRefused', t('reports.refused')),
          ]}
        >
          <TimeChart
            kind="bar"
            bucket={bucket}
            data={series}
            series={[
              { key: 'dosesSkipped', label: t('reports.skipped') },
              { key: 'dosesRefused', label: t('reports.refused') },
            ]}
          />
        </ChartCard>

        <QueryState query={diagnoses}>
          {(d) => {
            const shown = d.codes.filter((c) => c.count !== '<5').slice(0, 10);
            return (
              <ChartCard
                title={t('reports.dxTitle')}
                subtitle={t('reports.dxSub')}
                rows={d.codes}
                columns={[
                  { label: 'ICD-10', value: (r) => r.icd10Code },
                  {
                    label: t('reports.count'),
                    numeric: true,
                    value: (r) =>
                      r.count === '<5' ? '<5' : formatNumber(r.count),
                  },
                ]}
              >
                <RankChart
                  name={t('reports.count')}
                  data={shown.map((c) => ({
                    label: c.icd10Code,
                    value: c.count as number,
                  }))}
                />
              </ChartCard>
            );
          }}
        </QueryState>

        <ChartCard
          title={t('reports.critical')}
          subtitle={t('reports.criticalSub')}
          rows={critical.data?.days ?? []}
          columns={[
            {
              label: t('reports.day'),
              value: (r) => bucketLabel(r.day, 'day'),
            },
            { label: t('reports.test'), value: (r) => testName(r.testCode) },
            {
              label: t('reports.count'),
              numeric: true,
              value: (r) => (r.count === '<5' ? '<5' : formatNumber(r.count)),
            },
          ]}
        >
          <TimeChart
            kind="bar"
            bucket={bucket}
            data={criticalByBucket}
            series={[{ key: 'count', label: t('reports.criticalShort') }]}
          />
        </ChartCard>

        {appt && (
          <ChartCard
            title={t('reports.apptTitle')}
            subtitle={
              appt.noShowRate === null
                ? undefined
                : t('reports.noShowRate', { rate: appt.noShowRate })
            }
            rows={[
              { label: t('appt.done'), value: appt.completed },
              { label: t('appt.noShow'), value: appt.noShow },
              { label: t('appt.cancelled'), value: appt.cancelled },
              { label: t('appt.booked'), value: appt.booked },
            ]}
            columns={[
              { label: t('reports.status'), value: (r) => r.label },
              {
                label: t('reports.count'),
                numeric: true,
                value: (r) => formatNumber(r.value),
              },
            ]}
          >
            <RankChart
              name={t('reports.count')}
              data={[
                { label: t('appt.done'), value: appt.completed },
                { label: t('appt.noShow'), value: appt.noShow },
                { label: t('appt.cancelled'), value: appt.cancelled },
                { label: t('appt.booked'), value: appt.booked },
              ]}
            />
          </ChartCard>
        )}

        <OccupancyCard />
      </div>
    </div>
  );
}

/** A headline number, with the change against the period just before (same length) */
function Kpi({
  label,
  value,
  before,
  format = formatNumber,
}: {
  label: string;
  value: number | null;
  before?: number;
  format?: (n: number) => string;
}) {
  const change =
    value !== null && before
      ? Math.round(((value - before) / before) * 100)
      : null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
        {value === null ? '—' : format(value)}
      </div>
      {change !== null && (
        <div className="text-xs text-slate-500">
          {change > 0 ? '▲' : change < 0 ? '▼' : '='}{' '}
          {t('reports.vsBefore', {
            change: `${change > 0 ? '+' : ''}${change}`,
          })}
        </div>
      )}
    </div>
  );
}

/** Beds right now (not filtered by period: it's the current state) */
function OccupancyCard() {
  const occupancy = useOccupancy();
  return (
    <Card title={t('reports.occupancy')}>
      <QueryState query={occupancy}>
        {(o) => (
          <div className="space-y-4">
            <Meter
              label={t('reports.whole')}
              occupied={o.total.occupied}
              beds={o.total.bedsInService}
              rate={o.total.occupancyRate}
            />
            {o.wards.map((w) => (
              <Meter
                key={w.wardId}
                label={w.name}
                occupied={w.occupied}
                beds={w.bedsInService}
                rate={w.occupancyRate}
              />
            ))}
          </div>
        )}
      </QueryState>
    </Card>
  );
}

function Meter({
  label,
  occupied,
  beds,
  rate,
}: {
  label: string;
  occupied: number;
  beds: number;
  rate: number | null;
}) {
  const pct = rate ?? 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-slate-600">
          {t('reports.beds', { occupied, beds, rate: rate ?? '—' })}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-100"
        role="meter"
        aria-label={t('reports.occLabel', { label })}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-[#257de0]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
