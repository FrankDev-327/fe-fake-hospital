import { describe, expect, it } from 'vitest';
import { age, dueLabel, timeAgo } from './format';

// 20 Nov 2026, 13:00 in Zagreb (UTC+1)
const NOW = Date.parse('2026-11-20T12:00:00Z');

describe('format', () => {
  it('age counts full years only', () => {
    expect(age('1948-03-12', new Date(NOW))).toBe(78);
    expect(age('1948-12-01', new Date(NOW))).toBe(77); // birthday not reached yet
  });

  it('timeAgo', () => {
    expect(timeAgo('2026-11-20T11:55:00Z', NOW)).toBe('5 min ago');
    expect(timeAgo('2026-11-20T09:00:00Z', NOW)).toBe('3 h ago');
    expect(timeAgo('2026-11-17T12:00:00Z', NOW)).toBe('3 days ago');
  });

  it('dueLabel says when a dose is not today', () => {
    expect(dueLabel(new Date('2026-11-20T13:05:00Z'), NOW)).toBe('14:05');
    expect(dueLabel(new Date('2026-11-21T10:05:00Z'), NOW)).toBe(
      'tomorrow 11:05',
    );
    expect(dueLabel(new Date('2026-11-23T08:00:00Z'), NOW)).toBe(
      '23 Nov, 09:00',
    );
  });
});
