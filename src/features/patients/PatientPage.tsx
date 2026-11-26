import { getRouteApi, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useAuth } from '@/auth/auth-context';
import {
  Badge,
  Card,
  ErrorMessage,
  Loading,
  QueryState,
} from '@/components/ui';
import {
  SEVERITY,
  useAllergies,
  useOpenEncounter,
} from '@/features/clinical/api';
import { ProblemsCard } from '@/features/clinical/ProblemsCard';
import { VisitsCard } from '@/features/clinical/VisitsCard';
import { LabCard } from '@/features/lab/LabCard';
import { useRelations } from '@/features/maternity/api';
import { MedicationList } from '@/features/medication/MedicationList';
import { VitalsCard } from '@/features/vitals/VitalsCard';
import { ApiError } from '@/lib/api';
import {
  age,
  formatDate,
  formatDateTime,
  patientName,
  SEX_LABEL,
  timeAgo,
} from '@/lib/format';
import { usePatient } from './api';
import { ContactsCard } from './ContactsCard';
import { t } from '@/i18n';

const route = getRouteApi('/app/patients/$patientId');

export function PatientPage() {
  const { patientId } = route.useParams();
  const { state } = useAuth();
  const role = state.user?.role;
  const clinician = role === 'doctor' || role === 'nurse';
  const frontDesk = role === 'receptionist' || role === 'admin';
  const patient = usePatient(patientId);

  if (patient.isPending) return <Loading />;
  if (patient.error) {
    // 404 means "doesn't exist OR not yours": the backend doesn't say which, neither do we
    return patient.error instanceof ApiError && patient.error.status === 404 ? (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{t('patients.notFound')}</h1>
        <p className="text-sm text-slate-500">{t('patients.notFoundText')}</p>
        <Link to="/patients" className="text-sm text-teal-700 underline">
          {t('patients.backToPatients')}
        </Link>
      </div>
    ) : (
      <ErrorMessage error={patient.error} />
    );
  }

  const p = patient.data;
  return (
    <div className="space-y-6">
      <Link
        to="/patients"
        className="inline-block text-sm text-teal-800 hover:underline"
      >
        ← {t('patients.backToPatients')}
      </Link>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white px-5 py-4">
        <h1 className="text-2xl font-semibold">{patientName(p)}</h1>
        <span className="text-slate-600">
          {p.bornAt ? (
            // born here: the exact time matters more than "0 y" for a baby
            <>
              {t('patients.newbornSub', {
                sex: SEX_LABEL[p.sex],
                at: formatDateTime(p.bornAt),
                ago: timeAgo(p.bornAt),
              })}
            </>
          ) : (
            <>
              {t('patients.ageSub', {
                age: age(p.dateOfBirth),
                sex: SEX_LABEL[p.sex],
                date: formatDate(p.dateOfBirth),
              })}
            </>
          )}
        </span>
        {!p.firstName && <Badge tone="amber">{t('patients.noName')}</Badge>}
        <span className="font-mono text-sm text-slate-500">{p.mrn}</span>
        {p.bloodType && (
          <Badge tone="red">{t('patients.blood', { type: p.bloodType })}</Badge>
        )}
        {frontDesk && (
          <Link
            to="/patients/$patientId/edit"
            params={{ patientId: p.id }}
            className="ml-auto rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            {t('patients.editDetails')}
          </Link>
        )}
      </header>

      {clinician && <AllergyBanner patientId={p.id} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t('patients.details')}>
          <dl className="space-y-2 text-sm">
            <Detail label="OIB">{p.oib}</Detail>
            <Detail label={t('patients.mboShort')}>{p.mbo}</Detail>
            <Detail label={t('common.phone')}>{p.phone}</Detail>
            <Detail label={t('common.email')}>{p.email}</Detail>
            <Detail label={t('common.address')}>{p.address}</Detail>
          </dl>
        </Card>

        <ContactsCard patientId={p.id} canAdd={frontDesk} />
        <FamilyCard patientId={p.id} />

        {clinician && (
          <>
            <AllergiesCard patientId={p.id} />
            <MedicationCard patientId={p.id} patientLabel={patientName(p)} />
            <div className="lg:col-span-2">
              <VisitsCard patientId={p.id} canStart={role === 'doctor'} />
            </div>
            <ProblemsCard patientId={p.id} />
            <div className="lg:col-span-3">
              <ChartVitals patientId={p.id} newborn={!!p.bornAt} />
            </div>
            <div className="lg:col-span-3">
              <ChartLab patientId={p.id} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">
        {children ?? <span className="text-slate-400">—</span>}
      </dd>
    </div>
  );
}

/** The most dangerous allergies stay visible at the top of every chart. */
function AllergyBanner({ patientId }: { patientId: string }) {
  const { data } = useAllergies(patientId);
  const dangerous = data?.filter(
    (a) => a.severity === 'life_threatening' || a.severity === 'severe',
  );
  if (!dangerous?.length) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
    >
      <strong>{t('patients.allergyWarning')}</strong>{' '}
      {dangerous
        .map(
          (a) => `${a.substance} (${SEVERITY[a.severity].label.toLowerCase()})`,
        )
        .join(', ')}
    </div>
  );
}

function AllergiesCard({ patientId }: { patientId: string }) {
  const allergies = useAllergies(patientId);
  return (
    <Card title={t('patients.allergies')}>
      <QueryState
        query={allergies}
        isEmpty={(items) => items.length === 0}
        empty={t('patients.noAllergies')}
      >
        {(items) => (
          <ul className="space-y-3 text-sm">
            {items.map((a) => (
              <li key={a.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{a.substance}</span>
                  <Badge tone={SEVERITY[a.severity].tone}>
                    {SEVERITY[a.severity].label}
                  </Badge>
                </div>
                {a.reaction && <p className="text-slate-500">{a.reaction}</p>}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Card>
  );
}

/** Medication with actions; prescriptions go into the patient's open visit (if any) */
function MedicationCard({
  patientId,
  patientLabel,
}: {
  patientId: string;
  patientLabel: string;
}) {
  const openVisit = useOpenEncounter(patientId);
  return (
    <Card title={t('patients.activeMeds')}>
      <MedicationList
        patientId={patientId}
        patientLabel={patientLabel}
        openEncounterId={openVisit?.id}
      />
    </Card>
  );
}

/** Vitals and lab go into the patient's open visit (if there is one) */
function ChartVitals({
  patientId,
  newborn,
}: {
  patientId: string;
  newborn: boolean;
}) {
  const openVisit = useOpenEncounter(patientId);
  return (
    <VitalsCard
      patientId={patientId}
      openEncounterId={openVisit?.id}
      newborn={newborn}
    />
  );
}

/**
 * Mother <-> baby links (made when the birth is registered). Only shown when there are some.
 * The other person's chart may still be closed to you (then the link gives "not found").
 */
function FamilyCard({ patientId }: { patientId: string }) {
  const relations = useRelations(patientId);
  if (!relations.data?.length) return null;
  return (
    <Card title={t('patients.motherBaby')}>
      <ul className="space-y-2 text-sm">
        {relations.data.map((r) => (
          <li key={r.patientId} className="flex justify-between gap-2">
            <span className="text-slate-500">
              {r.relation === 'mother'
                ? t('patients.mother')
                : t('patients.baby')}
            </span>
            <Link
              to="/patients/$patientId"
              params={{ patientId: r.patientId }}
              className="font-medium text-teal-800 hover:underline"
            >
              {patientName(r)}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ChartLab({ patientId }: { patientId: string }) {
  const openVisit = useOpenEncounter(patientId);
  return <LabCard patientId={patientId} openEncounterId={openVisit?.id} />;
}
