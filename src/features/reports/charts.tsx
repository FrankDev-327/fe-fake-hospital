import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Table, Td, Th } from '@/components/ui';
import { t } from '@/i18n';
import type { Bucket } from './api';
import { AXIS, bucketLabel, formatNumber, GRID, SERIES } from './chart-format';

export interface Column<T> {
  label: string;
  value: (row: T) => ReactNode;
  numeric?: boolean;
}

/**
 * A chart with a "Table" switch: the same numbers as a table (screen readers, exact values,
 * and colors that are hard to tell apart).
 */
export function ChartCard<T>({
  title,
  subtitle,
  rows,
  columns,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  rows: T[];
  columns: Column<T>[];
  children: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section
      className={`rounded-lg border border-slate-200 bg-white ${className}`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div
          role="group"
          aria-label={t('reports.viewAs', { title })}
          className="flex shrink-0 gap-1 rounded-md bg-slate-100 p-0.5 text-xs"
        >
          {[false, true].map((table) => (
            <button
              key={String(table)}
              aria-pressed={asTable === table}
              onClick={() => setAsTable(table)}
              className={`rounded px-2 py-1 ${asTable === table ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}
            >
              {table ? t('reports.table') : t('reports.chart')}
            </button>
          ))}
        </div>
      </header>
      <div className="p-4">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            {t('reports.noData')}
          </p>
        ) : asTable ? (
          <div className="max-h-72 overflow-y-auto">
            <Table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <Th key={c.label}>{c.label}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <Td
                        key={c.label}
                        className={c.numeric ? 'text-right tabular-nums' : ''}
                      >
                        {c.value(row)}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <div className="h-64">{children}</div>
        )}
      </div>
    </section>
  );
}

export interface Series {
  key: string;
  label: string;
}

const axisProps = {
  stroke: AXIS,
  fontSize: 12,
  tickLine: false,
  axisLine: { stroke: GRID },
} as const;

/** Over time: lines (trends) or bars (counts per bucket, stacked when several series) */
export function TimeChart({
  data,
  series,
  bucket,
  kind,
}: {
  data: Record<string, number | string>[];
  series: Series[];
  bucket: Bucket;
  kind: 'line' | 'bar';
}) {
  const label = (day: unknown) => bucketLabel(String(day), bucket);
  const common = (
    <>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis
        dataKey="day"
        tickFormatter={label}
        minTickGap={24}
        {...axisProps}
      />
      <YAxis allowDecimals={false} width={40} {...axisProps} />
      <Tooltip
        labelFormatter={label}
        formatter={(v) => formatNumber(Number(v))}
        cursor={kind === 'bar' ? { fill: '#f1f5f9' } : { stroke: AXIS }}
      />
      {series.length > 1 && (
        <Legend
          iconType="circle"
          iconSize={8}
          // keep the series order (not alphabetical) and text in the normal ink, not the series color
          itemSorter={null}
          formatter={(value) => (
            <span className="text-sm text-slate-700">{value}</span>
          )}
        />
      )}
    </>
  );
  return (
    <ResponsiveContainer width="100%" height="100%">
      {kind === 'line' ? (
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          {common}
          {series.map((s, i) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={SERIES[i]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      ) : (
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {common}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={SERIES[i]}
              stroke="#fff"
              strokeWidth={series.length > 1 ? 1 : 0}
              // rounded data-end only on the top segment
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

/** Ranking or categories: horizontal bars, one series */
export function RankChart({
  data,
  name,
  vertical = true,
}: {
  data: { label: string; value: number }[];
  name: string;
  vertical?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout={vertical ? 'vertical' : 'horizontal'}
        margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
      >
        <CartesianGrid
          stroke={GRID}
          horizontal={!vertical}
          vertical={vertical}
        />
        {vertical ? (
          <>
            <XAxis type="number" allowDecimals={false} {...axisProps} />
            <YAxis
              type="category"
              dataKey="label"
              width={130}
              interval={0}
              {...axisProps}
            />
          </>
        ) : (
          <>
            <XAxis dataKey="label" interval={0} {...axisProps} />
            <YAxis allowDecimals={false} width={40} {...axisProps} />
          </>
        )}
        <Tooltip
          formatter={(v) => formatNumber(Number(v))}
          cursor={{ fill: '#f1f5f9' }}
        />
        <Bar
          dataKey="value"
          name={name}
          fill={SERIES[0]}
          radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          maxBarSize={28}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
