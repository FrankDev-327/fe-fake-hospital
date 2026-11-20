import { Link } from '@tanstack/react-router';
import { Table, Td, Th } from '@/components/ui';
import { age, formatDate, patientName, SEX_LABEL } from '@/lib/format';
import type { PatientSummary } from './api';

export function PatientTable({ patients }: { patients: PatientSummary[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Name</Th>
          <Th>MRN</Th>
          <Th>Age / sex</Th>
          <Th>Date of birth</Th>
        </tr>
      </thead>
      <tbody>
        {patients.map((p) => (
          <tr key={p.id} className="hover:bg-slate-50">
            <Td>
              <Link
                to="/patients/$patientId"
                params={{ patientId: p.id }}
                className="font-medium text-teal-800 hover:underline"
              >
                {patientName(p)}
              </Link>
            </Td>
            <Td className="font-mono text-xs text-slate-600">{p.mrn}</Td>
            <Td>
              {age(p.dateOfBirth)} {SEX_LABEL[p.sex]}
            </Td>
            <Td>{formatDate(p.dateOfBirth)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
