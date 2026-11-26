import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { STAFF_ROLES } from '@/auth/types';
import type { Staff, StaffRole } from '@/auth/types';
import { Badge, PageHeader, QueryState, Table, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { t } from '@/i18n';

const useStaff = (role: StaffRole | undefined) =>
  useQuery({
    queryKey: ['staff', 'list', role ?? 'all'],
    queryFn: ({ signal }) =>
      api<{ items: Staff[]; next: string | null }>(
        `/identity/staff${role ? `?role=${role}` : ''}`,
        { signal },
      ),
    select: (data) => data.items,
  });

/** Admin: staff accounts. (Assignments, wards and beds come in slice 10.) */
export function AdminPage() {
  const [role, setRole] = useState<StaffRole>();
  const staff = useStaff(role);
  return (
    <>
      <PageHeader
        title={t('admin.staff')}
        subtitle={t('admin.sub')}
        actions={
          <label className="text-sm">
            <span className="mr-2 text-slate-600">{t('admin.role')}</span>
            <select
              value={role ?? ''}
              onChange={(e) =>
                setRole((e.target.value || undefined) as StaffRole | undefined)
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">{t('admin.all')}</option>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </select>
          </label>
        }
      />
      <QueryState
        query={staff}
        isEmpty={(s) => s.length === 0}
        empty={t('admin.none')}
      >
        {(items) => (
          <Table>
            <thead>
              <tr>
                <Th>{t('admin.name')}</Th>
                <Th>{t('admin.role')}</Th>
                <Th>{t('admin.email')}</Th>
                <Th>{t('admin.license')}</Th>
                <Th>{t('admin.status')}</Th>
                <Th>{t('admin.lastLogin')}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium">
                    {s.lastName}, {s.firstName}
                  </Td>
                  <Td>{t(`roles.${s.role}`)}</Td>
                  <Td className="text-slate-600">{s.email}</Td>
                  <Td className="font-mono text-xs">
                    {s.licenseNumber ?? '—'}
                  </Td>
                  <Td>
                    {s.isActive ? (
                      <Badge tone="green">{t('admin.active')}</Badge>
                    ) : (
                      <Badge>{t('admin.deactivated')}</Badge>
                    )}
                  </Td>
                  <Td className="text-slate-500">
                    {s.lastLoginAt ? timeAgo(s.lastLoginAt) : t('admin.never')}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </QueryState>
    </>
  );
}
