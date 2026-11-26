/**
 * The fake "live" service: handlers publish change events here, the fake SSE stream
 * (GET /api/live/stream) sends them to the open screens.
 * Other tabs get them through a BroadcastChannel, so a discharge in one tab shows up in another
 * (each tab has its own fake backend in memory; the event tells it to reload from localStorage).
 */
export interface LiveEvent {
  type: string;
  patientId?: string;
  id?: string;
}

type Listener = (e: LiveEvent) => void;
const listeners = new Set<Listener>();
let onRemote: (() => void) | null = null;

// not in tests: test files run side by side and must not see each other's events
const channel =
  import.meta.env.MODE !== 'test' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('mock-live')
    : null;

channel?.addEventListener('message', (m: MessageEvent<LiveEvent>) => {
  onRemote?.(); // another tab changed the data: reload it first
  listeners.forEach((l) => l(m.data));
});

export const live = {
  publish(e: LiveEvent) {
    listeners.forEach((l) => l(e));
    channel?.postMessage(e);
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** what to do when another tab changed something (mockDb.reload) */
  onRemoteChange(fn: () => void) {
    onRemote = fn;
  },
};
