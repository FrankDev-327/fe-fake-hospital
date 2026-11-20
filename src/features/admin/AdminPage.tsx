import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ROLE_LABELS, STAFF_ROLES } from '@/auth/types';
import type { Staff, StaffRole } from '@/auth/types';
import { Badge, PageHeader, QueryState, Table, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';

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
        title="Staff"
        subtitle="Everyone with an account"
        actions={
          <label className="text-sm">
            <span className="mr-2 text-slate-600">Role</span>
            <select
              value={role ?? ''}
              onChange={(e) =>
                setRole((e.target.value || undefined) as StaffRole | undefined)
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">All</option>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        }
      />
      <QueryState
        query={staff}
        isEmpty={(s) => s.length === 0}
        empty="Nobody with this role."
      >
        {(items) => (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Email</Th>
                <Th>License</Th>
                <Th>Status</Th>
                <Th>Last login</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium">
                    {s.lastName}, {s.firstName}
                  </Td>
                  <Td>{ROLE_LABELS[s.role]}</Td>
                  <Td className="text-slate-600">{s.email}</Td>
                  <Td className="font-mono text-xs">
                    {s.licenseNumber ?? '—'}
                  </Td>
                  <Td>
                    {s.isActive ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge>Deactivated</Badge>
                    )}
                  </Td>
                  <Td className="text-slate-500">
                    {s.lastLoginAt ? timeAgo(s.lastLoginAt) : 'Never'}
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
