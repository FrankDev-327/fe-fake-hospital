import { openStream } from './api';

export interface SseMessage {
  event: string;
  data: string;
}

/**
 * Splits what arrived so far into complete SSE messages (they end with an empty line).
 * Returns the messages and the unfinished rest, which waits for the next chunk.
 * Lines starting with ":" are comments (the server's keep-alive pings).
 */
export function parseSse(buffer: string): {
  messages: SseMessage[];
  rest: string;
} {
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';
  const messages: SseMessage[] = [];
  for (const part of parts) {
    let event = 'message';
    const data: string[] = [];
    for (const line of part.split('\n')) {
      if (line.startsWith(':') || !line) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length) messages.push({ event, data: data.join('\n') });
  }
  return { messages, rest };
}

export type LiveStatus = 'connecting' | 'live' | 'reconnecting';

export interface LiveChange {
  type: string;
  patientId?: string;
  id?: string;
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * Keeps the live stream open until `signal` aborts. When the connection drops it tries again
 * after 1 s, 2 s, 4 s... (max 30 s). After a reconnect `onReconnect` runs: events sent while
 * we were offline are lost, so the screen should reload what it shows.
 */
export async function connectLive(
  patientIds: string[],
  handlers: {
    onChange: (change: LiveChange) => void;
    onStatus: (status: LiveStatus) => void;
    onReconnect: () => void;
  },
  signal: AbortSignal,
) {
  let backoff = 1000;
  let first = true;
  while (!signal.aborted) {
    try {
      const res = await openStream(
        `/live/stream?patients=${patientIds.join(',')}`,
        signal,
      );
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      handlers.onStatus('live');
      if (!first) handlers.onReconnect();
      first = false;
      backoff = 1000;
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const parsed = parseSse(buffer + value);
        buffer = parsed.rest;
        for (const m of parsed.messages)
          if (m.event === 'change')
            handlers.onChange(JSON.parse(m.data) as LiveChange);
      }
    } catch {
      // dropped or refused: try again below
    }
    if (signal.aborted) break;
    handlers.onStatus('reconnecting');
    await wait(backoff, signal);
    backoff = Math.min(backoff * 2, 30_000);
  }
}
