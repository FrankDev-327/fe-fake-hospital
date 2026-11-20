import { Badge, Card, QueryState } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { DIAGNOSIS_STATUS, useDiagnoses } from './api';

/** Current diagnoses from all visits: the patient's problem list. */
export function ProblemsCard({ patientId }: { patientId: string }) {
  const diagnoses = useDiagnoses(patientId);
  return (
    <Card title="Diagnoses">
      <QueryState
        query={diagnoses}
        isEmpty={(d) => d.length === 0}
        empty="No diagnoses."
      >
        {(items) => (
          <ul className="space-y-3 text-sm">
            {items.map((d) => (
              <li
                key={d.id}
                className={d.status === 'resolved' ? 'text-slate-500' : ''}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="font-mono text-xs text-slate-500">
                      {d.icd10Code}
                    </span>{' '}
                    <span className="font-medium">{d.icd10Title}</span>
                  </span>
                  <Badge tone={DIAGNOSIS_STATUS[d.status].tone}>
                    {DIAGNOSIS_STATUS[d.status].label}
                  </Badge>
                </div>
                <div className="text-xs text-slate-400">
                  {d.rank === 'primary' ? 'Primary' : 'Secondary'} ·{' '}
                  {formatDate(d.diagnosedAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Card>
  );
}
