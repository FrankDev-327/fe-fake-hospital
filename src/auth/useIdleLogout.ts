import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
];

/**
 * Calls onIdle after `timeoutMs` without user activity, while `enabled`.
 * Activity only updates a timestamp (cheap, mousemove fires a lot); a timer checks it every 15 s.
 */
export function useIdleLogout(
  enabled: boolean,
  timeoutMs: number,
  onIdle: () => void,
) {
  // a ref keeps the latest callback without restarting the effect when it changes
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled) return;
    let lastActivity = Date.now();
    const markActive = () => {
      lastActivity = Date.now();
    };
    for (const event of ACTIVITY_EVENTS)
      window.addEventListener(event, markActive, { passive: true });
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity >= timeoutMs) onIdleRef.current();
    }, 15_000);

    // cleanup: runs when logged out or the component goes away
    return () => {
      for (const event of ACTIVITY_EVENTS)
        window.removeEventListener(event, markActive);
      window.clearInterval(timer);
    };
  }, [enabled, timeoutMs]);
}
