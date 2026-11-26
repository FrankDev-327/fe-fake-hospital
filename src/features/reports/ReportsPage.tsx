import { useQuery } from '@tanstack/react-query';
import { Card, PageHeader, QueryState, Table, Td, Th } from '@/components/ui';
import { useLabTests } from '@/features/lab/api';
import { api } from '@/lib/api';
import { useNow } from '@/hooks/useNow';
import { formatDate, isoDay } from '@/lib/format';
import { t } from '@/i18n';

interface Occupancy {
  wards: {
    wardId: string;
    code: string;
    name: string;
    bedsInService: number;
    occupied: number;
    occupancyRate: number | null;
  }[];
  total: {
    bedsInService: number;
    occupied: number;
    occupancyRate: number | null;
  };
}

interface CriticalResults {
  days: { day: string; testCode: string; count: number | '<5' }[];
}

/** Reports are numbers only: no patient appears here. Small counts come as "<5". */
export function ReportsPage() {
  const occupancy = useQuery({
    queryKey: ['reports', 'occupancy'],
    queryFn: ({ signal }) =>
      api<Occupancy>('/reporting/reports/occupancy', { signal }),
  });
  const catalog = useLabTests();
  const now = useNow();
  const to = isoDay(new Date(now));
  const from = isoDay(new Date(now - 6 * 86_400_000));
  const critical = useQuery({
    queryKey: ['reports', 'critical-results', from, to],
    queryFn: ({ signal }) =>
      api<CriticalResults>(
        `/reporting/reports/critical-results?from=${from}&to=${to}`,
        {
          signal,
        },
      ),
  });

  return (
    <>
      <PageHeader title={t('reports.title')} subtitle={t('reports.sub')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('reports.occupancy')}>
          <QueryState query={occupancy}>
            {(o) => (
              <div className="space-y-4">
                <Stat
                  label={t('reports.whole')}
                  occupied={o.total.occupied}
                  beds={o.total.bedsInService}
                  rate={o.total.occupancyRate}
                />
                {o.wards.map((w) => (
                  <Stat
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

        <Card title={t('reports.critical')}>
          <QueryState
            query={critical}
            isEmpty={(c) => c.days.length === 0}
            empty={t('reports.none')}
          >
            {(c) => (
              <Table>
                <thead>
                  <tr>
                    <Th>{t('reports.day')}</Th>
                    <Th>{t('reports.test')}</Th>
                    <Th>{t('reports.count')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {c.days.map((d) => (
                    <tr key={`${d.day}-${d.testCode}`}>
                      <Td>{formatDate(d.day)}</Td>
                      <Td>
                        {catalog.data?.find((t) => t.code === d.testCode)
                          ?.name ?? d.testCode}
                      </Td>
                      <Td className="font-mono">{d.count}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </QueryState>
        </Card>
      </div>
    </>
  );
}

function Stat({
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
          className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-teal-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
