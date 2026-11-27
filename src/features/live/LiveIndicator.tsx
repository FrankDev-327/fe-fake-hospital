import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { useMyPatients } from '@/features/patients/api';
import { connectLive } from '@/lib/live';
import type { LiveChange, LiveStatus } from '@/lib/live';
import { useFollowedWards } from '@/lib/live-wards';
import { t } from '@/i18n';

/** Off in unit tests: an endless stream would keep every test waiting. */
const ENABLED = import.meta.env.MODE !== 'test';

/**
 * Who keeps a stream open: doctors and nurses (their patients + ward boards), the front desk
 * (appointment changes, ward boards) and admin (ward boards). Same roles the backend pushes to.
 */
const LIVE_ROLES = new Set(['doctor', 'nurse', 'receptionist', 'admin']);

/**
 * Keeps one live connection open and turns each pushed change into "this data is old" for
 * TanStack Query: the screens that show it reload by themselves. Follows the user's patients
 * and the ward boards on screen. Shows a small "Live" dot in the header.
 */
export function LiveIndicator() {
  const queryClient = useQueryClient();
  const { state } = useAuth();
  const role = state.status === 'logged_in' ? state.user.role : null;
  const live = ENABLED && !!role && LIVE_ROLES.has(role);
  // only doctors and nurses have "my patients"
  const mine = useMyPatients(role === 'doctor' || role === 'nurse');
  const wards = useFollowedWards();
  const [status, setStatus] = useState<LiveStatus>('connecting');
  // max 50 per stream (backend limit); the key only changes when the list really changes
  const ids = useMemo(
    () => (mine.data ?? []).map((p) => p.id).slice(0, 50),
    [mine.data],
  );
  const patientKey = ids.join(',');

  useEffect(() => {
    if (!live) return;
    const abort = new AbortController();
    const onChange = (c: LiveChange) => {
      if (c.type === 'my_patients.changed') {
        void queryClient.invalidateQueries({ queryKey: ['patients', 'mine'] });
        return;
      }
      if (c.type === 'bed.changed') {
        // someone's bed changed on a ward board on screen: reload that board
        void queryClient.invalidateQueries({
          queryKey: c.wardId ? ['wards', c.wardId, 'beds'] : ['wards'],
        });
        return;
      }
      if (c.type === 'appointment.changed') {
        void queryClient.invalidateQueries({ queryKey: ['appointments'] });
        return;
      }
      if (c.type === 'admission.changed')
        void queryClient.invalidateQueries({ queryKey: ['wards'] });
      // everything about that patient (chart, stays, meds...) is reloaded where it's shown
      if (c.patientId)
        void queryClient.invalidateQueries({
          queryKey: ['patients', c.patientId],
        });
    };
    void connectLive(
      patientKey ? patientKey.split(',') : [],
      wards ? wards.split(',') : [],
      {
        onChange,
        onStatus: setStatus,
        // events sent while we were offline are lost: reload what's on screen
        onReconnect: () => void queryClient.invalidateQueries(),
      },
      abort.signal,
    );
    return () => abort.abort();
  }, [live, patientKey, wards, queryClient]);

  if (!live) return null;
  const isLive = status === 'live';
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-slate-500"
      title={t(`live.${status}Hint`)}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${isLive ? 'bg-emerald-500' : 'animate-pulse bg-amber-500'}`}
      />
      {t(`live.${status}`)}
    </span>
  );
}
