import { useEffect, useSyncExternalStore } from 'react';

/**
 * Which ward boards are on screen right now. The live stream follows them
 * (`/live/stream?wards=...`) so the board reloads at once when a bed changes, also for other
 * people's patients (they only came with the 30 s poll before).
 */
const followed = new Map<string, number>(); // wardId -> how many boards show it
const listeners = new Set<() => void>();
let snapshot = '';

function publish() {
  snapshot = [...followed.keys()].sort().join(',');
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Comma-separated ward ids on screen ('' when none). Stable string: safe as an effect key. */
export const useFollowedWards = () =>
  useSyncExternalStore(subscribe, () => snapshot);

/** A ward board calls this with the ward it shows. */
export function useFollowWard(wardId: string | undefined) {
  useEffect(() => {
    if (!wardId) return;
    followed.set(wardId, (followed.get(wardId) ?? 0) + 1);
    publish();
    return () => {
      const n = (followed.get(wardId) ?? 1) - 1;
      if (n > 0) followed.set(wardId, n);
      else followed.delete(wardId);
      publish();
    };
  }, [wardId]);
}
