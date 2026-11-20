import { describe, expect, it } from 'vitest';
import { PatientFormSchema, toFormValues, toInput } from './patient-form';

const valid = {
  ...toFormValues(),
  firstName: 'Ana',
  lastName: 'Horvat',
  dateOfBirth: '1990-04-02',
};

describe('patient form', () => {
  it('turns empty optional fields into null for the backend', () => {
    const input = toInput(PatientFormSchema.parse(valid));
    expect(input).toMatchObject({
      firstName: 'Ana',
      oib: null,
      email: null,
      bloodType: null,
    });
  });

  it('checks the OIB check digit like the backend', () => {
    expect(
      PatientFormSchema.safeParse({ ...valid, oib: '69435151530' }).success,
    ).toBe(true);
    expect(
      PatientFormSchema.safeParse({ ...valid, oib: '69435151531' }).success,
    ).toBe(false);
    expect(PatientFormSchema.safeParse({ ...valid, oib: '123' }).success).toBe(
      false,
    );
  });

  it('rejects a date of birth in the future', () => {
    expect(
      PatientFormSchema.safeParse({ ...valid, dateOfBirth: '2999-01-01' })
        .success,
    ).toBe(false);
  });
});
