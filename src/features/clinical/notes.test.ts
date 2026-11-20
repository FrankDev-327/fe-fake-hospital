import { describe, expect, it } from 'vitest';
import { isEmptyNote, NOTE_TEMPLATE } from './api';

describe('isEmptyNote', () => {
  it('treats the bare templates as empty', () => {
    for (const template of Object.values(NOTE_TEMPLATE))
      expect(isEmptyNote(template)).toBe(true);
  });
  it('sees real text, even under one heading only', () => {
    expect(isEmptyNote('S: \nO: \nA: pneumonia\nP: ')).toBe(false);
    expect(isEmptyNote('Ate the whole lunch.')).toBe(false);
    expect(isEmptyNote('S: cough')).toBe(false);
  });
});
