import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/Button';
import { ReasonDialog } from '@/components/ReasonDialog';
import { Card, QueryState, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { StaffName } from '@/features/staff/StaffName';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, timeAgo } from '@/lib/format';
import {
  formatVital,
  useVitals,
  useVitalsActions,
  VITAL_ORDER,
  VITALS,
} from './api';
import type { Observation, VitalType } from './api';
import { RecordVitalsDialog } from './RecordVitalsDialog';

/** Chart colors: categorical slots 1 and 2, validated (colorblind-safe, 3:1 on white) */
const SERIES_1 = '#2a78d6';
const SERIES_2 = '#eb6834';
const INK_MUTED = '#64748b'; // slate-500: axis text
const GRID = '#e2e8f0'; // slate-200: recessive grid

/**
 * Vitals of a patient: the latest value of each sign (tiles), the trend of the chosen sign
 * (chart) and the readings themselves (table, where a wrong one is marked as error).
 */
export function VitalsCard({
  patientId,
  openEncounterId,
}: {
  patientId: string;
  /** where new readings go; none = no "Record vitals" */
  openEncounterId?: string;
}) {
  const vitals = useVitals(patientId);
  const [recording, setRecording] = useState(false);
  const [chosen, setChosen] = useState<VitalType | null>(null);

  return (
    <Card
      title={
        <span className="flex items-center justify-between">
          Vitals
          {openEncounterId && (
            <Button className="py-1" onClick={() => setRecording(true)}>
              Record vitals
            </Button>
          )}
        </span>
      }
    >
      <QueryState
        query={vitals}
        isEmpty={(v) => v.length === 0}
        empty="No vitals recorded yet."
      >
        {(all) => {
          const active = all.filter((o) => o.status === 'active');
          const latest = VITAL_ORDER.map((t) =>
            active.find((o) => o.type === t),
          ).filter((o): o is Observation => !!o);
          const type = chosen ?? latest[0]?.type ?? 'bp';
          return (
            <div className="space-y-4">
              <div
                role="tablist"
                aria-label="Vital sign"
                className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6"
              >
                {latest.map((o) => (
                  <button
                    key={o.type}
                    role="tab"
                    aria-selected={o.type === type}
                    onClick={() => setChosen(o.type)}
                    className={`rounded-md border px-3 py-2 text-left ${
                      o.type === type
                        ? 'border-teal-600 bg-teal-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-xs text-slate-500">
                      {VITALS[o.type].short}
                    </div>
                    <div className="font-semibold">{formatVital(o)}</div>
                    <div className="text-xs text-slate-400">
                      {timeAgo(o.recordedAt)}
                    </div>
                  </button>
                ))}
              </div>
              <VitalChart
                type={type}
                readings={active.filter((o) => o.type === type)}
              />
              <ReadingsTable
                patientId={patientId}
                readings={all.filter((o) => o.type === type)}
              />
            </div>
          );
        }}
      </QueryState>
      {recording && openEncounterId && (
        <RecordVitalsDialog
          patientId={patientId}
          encounterId={openEncounterId}
          onClose={() => setRecording(false)}
        />
      )}
    </Card>
  );
}

/** One sign over time. One axis; BP = two lines (systolic, diastolic) in the same unit. */
function VitalChart({
  type,
  readings,
}: {
  type: VitalType;
  readings: Observation[];
}) {
  if (readings.length < 2)
    return (
      <p className="text-sm text-slate-500">
        Not enough readings for a trend yet.
      </p>
    );
  const data = [...readings]
    .reverse() // oldest first, left to right
    .map((o) => ({
      t: Date.parse(o.recordedAt),
      value: o.value,
      value2: o.value2,
    }));
  const bp = type === 'bp';
  const { label, unit } = VITALS[type];
  return (
    <figure>
      <figcaption className="mb-1 text-sm font-medium text-slate-700">
        {label} ({unit})
      </figcaption>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(t: number) =>
                formatDateTime(new Date(t).toISOString())
              }
              tick={{ fill: INK_MUTED, fontSize: 11 }}
              stroke={GRID}
              minTickGap={40}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fill: INK_MUTED, fontSize: 11 }}
              stroke={GRID}
              width={40}
            />
            <Tooltip
              labelFormatter={(t) =>
                formatDateTime(new Date(Number(t)).toISOString())
              }
              formatter={(v, name) => [`${v} ${unit}`, name]}
            />
            {bp && (
              <Legend verticalAlign="top" height={24} iconType="plainline" />
            )}
            <Line
              name={bp ? 'Systolic' : label}
              dataKey="value"
              stroke={SERIES_1}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
            {bp && (
              <Line
                name="Diastolic"
                dataKey="value2"
                stroke={SERIES_2}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** The readings as a table (also the accessible version of the chart) */
function ReadingsTable({
  patientId,
  readings,
}: {
  patientId: string;
  readings: Observation[];
}) {
  const { markError } = useVitalsActions(patientId);
  const toast = useToast();
  const [wrong, setWrong] = useState<Observation | null>(null);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? readings : readings.slice(0, 5);
  return (
    <div className="space-y-2">
      <Table>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Value</Th>
            <Th>By</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {shown.map((o) => {
            const error = o.status === 'entered_in_error';
            return (
              <tr key={o.id} className={error ? 'text-slate-400' : ''}>
                <Td>{formatDateTime(o.recordedAt)}</Td>
                <Td className={error ? 'line-through' : 'font-medium'}>
                  {formatVital(o)}
                </Td>
                <Td>
                  <StaffName id={o.recordedBy} />
                </Td>
                <Td className="text-right">
                  {error ? (
                    <span className="text-xs text-red-700">
                      Error: {o.errorReason}
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      className="py-1 text-xs"
                      onClick={() => setWrong(o)}
                    >
                      Mark as error
                    </Button>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {readings.length > 5 && (
        <Button
          variant="ghost"
          className="py-1 text-xs"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'Show fewer' : `Show all ${readings.length}`}
        </Button>
      )}
      {wrong && (
        <ReasonDialog
          title={`Mark ${formatVital(wrong)} as error`}
          confirmLabel="Mark as error"
          danger
          pending={markError.isPending}
          error={markError.error ? errorMessage(markError.error) : null}
          onClose={() => setWrong(null)}
          onConfirm={(reason) =>
            markError.mutate(
              { id: wrong.id, reason },
              {
                onSuccess: () => {
                  toast('Reading marked as error');
                  setWrong(null);
                },
              },
            )
          }
        >
          The reading stays in the record, crossed out, and is left out of the
          chart.
        </ReasonDialog>
      )}
    </div>
  );
}
