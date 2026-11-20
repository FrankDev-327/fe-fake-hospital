import { describe, expect, it } from 'vitest';
import { matchesPatient } from './filter';

const josip = {
  id: '1',
  mrn: 'MRN-240137',
  firstName: 'Josip',
  lastName: 'Matić',
  sex: 'male',
  dateOfBirth: '1948-03-12',
};

describe('matchesPatient', () => {
  it.each([
    ['', true], // empty filter shows everyone
    ['Matić', true],
    ['matic', true], // no accents needed
    ['MATIĆ', true],
    ['jos mat', true], // every word, any order
    ['mat jos', true],
    ['mrn-240137', true],
    ['240137', true],
    ['josipa', false],
    ['mat ana', false],
  ])('"%s" -> %s', (filter, expected) => {
    expect(matchesPatient(josip, filter)).toBe(expected);
  });
});
