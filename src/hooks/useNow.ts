import { useEffect, useState } from 'react';

/**
 * The current time as STATE, updated every `intervalMs`.
 * Components must render the same thing for the same inputs, so they can't call Date.now()
 * while rendering; with this, "now" is an input and "overdue" badges update by themselves.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
