import { describe, expect, it } from 'vitest';
import { parseSse } from './live';

describe('parseSse', () => {
  it('reads whole messages, skips pings, keeps the unfinished rest', () => {
    const { messages, rest } = parseSse(
      'event: ready\ndata: {"patients":2}\n\n: ping\n\nevent: change\ndata: {"type":"a"}\n\nevent: cha',
    );
    expect(messages).toEqual([
      { event: 'ready', data: '{"patients":2}' },
      { event: 'change', data: '{"type":"a"}' },
    ]);
    expect(rest).toBe('event: cha');
  });

  it('joins a message split across chunks', () => {
    const first = parseSse('event: change\nda');
    expect(first.messages).toEqual([]);
    const second = parseSse(first.rest + 'ta: {"x":1}\r\n\r\n');
    expect(second.messages).toEqual([{ event: 'change', data: '{"x":1}' }]);
  });
});

describe('streamPath', () => {
  it('sends patients and ward boards, and works with neither', async () => {
    const { streamPath } = await import('./live');
    expect(streamPath(['p1', 'p2'], ['w1'])).toBe(
      '/live/stream?patients=p1%2Cp2&wards=w1',
    );
    expect(streamPath([], ['w1'])).toBe('/live/stream?wards=w1');
    expect(streamPath([], [])).toBe('/live/stream');
  });
});
