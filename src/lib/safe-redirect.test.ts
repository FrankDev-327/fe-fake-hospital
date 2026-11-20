import { describe, expect, it } from 'vitest';
import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it.each([
    ['/lab', '/lab'],
    ['/patients?q=ana', '/patients?q=ana'],
    [undefined, '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});
