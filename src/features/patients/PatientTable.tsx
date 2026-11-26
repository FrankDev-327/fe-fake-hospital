import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Table, Td, Th } from '@/components/ui';
import { age, formatDate, patientName, SEX_LABEL } from '@/lib/format';
import type { PatientSummary } from './api';
import { t } from '@/i18n';

const PAGE_SIZE = 15;

export function PatientTable({ patients }: { patients: PatientSummary[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(patients.length / PAGE_SIZE));
  // a new filter can shrink the list below the page we were on
  const current = Math.min(page, pages - 1);
  const shown = patients.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>{t('patients.colName')}</Th>
            <Th>MRN</Th>
            <Th>{t('patients.colAgeSex')}</Th>
            <Th>{t('patients.dob')}</Th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => (
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
      {pages > 1 && (
        <nav className="mt-3 flex items-center justify-end gap-3 text-sm text-slate-600">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:opacity-40"
          >
            {t('patients.prevPage')}
          </button>
          <span>
            {t('patients.pageOf', {
              page: current + 1,
              pages,
              total: patients.length,
            })}
          </span>
          <button
            type="button"
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:opacity-40"
          >
            {t('patients.nextPage')}
          </button>
        </nav>
      )}
    </>
  );
}
