import { getRouteApi, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { PageHeader, QueryState } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useMyPatients, usePatientSearch } from './api';
import { matchesPatient } from './filter';
import { PatientTable } from './PatientTable';

/** Doctors and nurses see their patients; the front desk searches everyone. */
export function PatientsPage() {
  const { state } = useAuth();
  const role = state.user?.role;
  return role === 'receptionist' || role === 'admin' ? (
    <PatientSearch />
  ) : (
    <MyPatients />
  );
}

function MyPatients() {
  const patients = useMyPatients();
  // the list is already loaded, so filtering happens right here: no request, no waiting
  const [filter, setFilter] = useState('');
  return (
    <>
      <PageHeader
        title="My patients"
        subtitle="Patients you are assigned to right now"
      />
      <input
        type="search"
        aria-label="Filter my patients"
        placeholder="Filter by name or MRN"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-4 w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 focus:outline-none"
      />
      <QueryState
        query={patients}
        isEmpty={(items) => items.length === 0}
        empty="No patients assigned to you."
      >
        {(items) => {
          const shown = items.filter((p) => matchesPatient(p, filter));
          return shown.length ? (
            <PatientTable patients={shown} />
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">
              None of your patients matches "{filter.trim()}".
            </p>
          );
        }}
      </QueryState>
    </>
  );
}

const route = getRouteApi('/app/patients');

function PatientSearch() {
  // the search text lives in the URL (?q=...): reload, back button and links keep it
  const { q = '' } = route.useSearch();
  const navigate = route.useNavigate();
  const [text, setText] = useState(q);
  const debounced = useDebouncedValue(text.trim());

  useEffect(() => {
    if (debounced !== q)
      void navigate({ search: { q: debounced || undefined }, replace: true });
  }, [debounced, q, navigate]);

  const results = usePatientSearch(q);

  return (
    <>
      <PageHeader
        title="Patients"
        subtitle="Search by name or MRN"
        actions={
          <Link
            to="/patients/new"
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            Register patient
          </Link>
        }
      />
      <input
        type="search"
        aria-label="Search patients"
        placeholder="e.g. Matić or MRN-240137"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        className="mb-4 w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 focus:outline-none"
      />
      {q.length < 3 ? (
        <p className="text-sm text-slate-500">Type at least 3 characters.</p>
      ) : (
        <QueryState
          query={results}
          isEmpty={(items) => items.length === 0}
          empty={`No patient matches "${q}".`}
        >
          {(items) => <PatientTable patients={items} />}
        </QueryState>
      )}
    </>
  );
}
