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
