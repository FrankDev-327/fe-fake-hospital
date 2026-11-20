import { displayName } from '@/lib/format';
import { useStaffCard } from './api';

/** "Dr. Ana Kovač" for a staff id (shows "…" while loading) */
export function StaffName({ id }: { id: string | null | undefined }) {
  const card = useStaffCard(id);
  if (!id) return null;
  return <>{card.data ? displayName(card.data) : '…'}</>;
}
