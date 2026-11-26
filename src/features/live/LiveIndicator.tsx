import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useMyPatients } from '@/features/patients/api';
import { connectLive } from '@/lib/live';
import type { LiveChange, LiveStatus } from '@/lib/live';
import { t } from '@/i18n';

/** Off in unit tests: an endless stream would keep every test waiting. */
const ENABLED = import.meta.env.MODE !== 'test';

/**
 * Keeps one live connection open for the doctor's / nurse's patients and turns each pushed
 * change into "this data is old" for TanStack Query: the screens that show it reload by
 * themselves. Shows a small "Live" dot in the header.
 */
export function LiveIndicator() {
  const queryClient = useQueryClient();
  const mine = useMyPatients();
  const [status, setStatus] = useState<LiveStatus>('connecting');
  // max 50 per stream (backend limit); the key only changes when the list really changes
  const ids = useMemo(
    () => (mine.data ?? []).map((p) => p.id).slice(0, 50),
    [mine.data],
  );
  const key = ids.join(',');

  useEffect(() => {
    if (!ENABLED || !key) return;
    const abort = new AbortController();
    const onChange = (c: LiveChange) => {
      if (c.type === 'my_patients.changed') {
        void queryClient.invalidateQueries({ queryKey: ['patients', 'mine'] });
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
      key.split(','),
      {
        onChange,
        onStatus: setStatus,
        // events sent while we were offline are lost: reload what's on screen
        onReconnect: () => void queryClient.invalidateQueries(),
      },
      abort.signal,
    );
    return () => abort.abort();
  }, [key, queryClient]);

  if (!ENABLED || !key) return null;
  const live = status === 'live';
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-slate-500"
      title={t(`live.${status}Hint`)}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'animate-pulse bg-amber-500'}`}
      />
      {t(`live.${status}`)}
    </span>
  );
}
