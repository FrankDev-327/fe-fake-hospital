import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PATIENTS } from '@/mocks/data/patients';
import { renderApp } from '@/test/render-app';
import { toReadings } from './readings';

const josip = PATIENTS[0]!;

describe('toReadings (the vitals form)', () => {
  it('sends only what was filled, with BP as two values', () => {
    expect(
      toReadings({ temperature: '37,4', bp: '120', bp2: '80', pulse: '' }),
    ).toEqual({
      readings: [
        { type: 'bp', value: 120, value2: 80 },
        { type: 'temperature', value: 37.4 },
      ],
      errors: {},
    });
  });
  it('catches typos with the backend ranges', () => {
    expect(toReadings({ temperature: '374' }).errors).toEqual({
      temperature: '25 to 45',
    });
    expect(toReadings({ bp: '80', bp2: '120' }).errors).toEqual({
      bp2: 'Lower than systolic (20 to 200)',
    });
    expect(toReadings({ pain: '4.5' }).errors).toEqual({
      pain: 'Whole number 0 to 10',
    });
  });
});

describe('nurse: vitals on the chart', () => {
  it('records a round and shows the new latest values', async () => {
    const { user } = renderApp(`/patients/${josip.id}`, { as: 'nurse' });
    await user.click(
      await screen.findByRole('button', { name: 'Record vitals' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Temperature (°C)'), '371');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('25 to 45')).toBeInTheDocument(); // typo caught, nothing sent

    await user.clear(within(dialog).getByLabelText('Temperature (°C)'));
    await user.type(within(dialog).getByLabelText('Temperature (°C)'), '37.1');
    await user.type(within(dialog).getByLabelText('BP systolic (mmHg)'), '118');
    await user.type(within(dialog).getByLabelText('BP diastolic (mmHg)'), '72');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('2 readings saved');

    const tabs = screen.getByRole('tablist', { name: 'Vital sign' });
    expect(within(tabs).getByText('118/72 mmHg')).toBeInTheDocument();
    expect(within(tabs).getByText('37.1 °C')).toBeInTheDocument();
  });

  it('marks a wrong reading as error (it stays, crossed out)', async () => {
    const { user } = renderApp(`/patients/${josip.id}`, { as: 'nurse' });
    await user.click(await screen.findByRole('tab', { name: /Temp/ }));
    const [first] = await screen.findAllByRole('button', {
      name: 'Mark as error',
    });
    await user.click(first!);
    await user.type(screen.getByLabelText('Reason'), 'Wrong patient');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Mark as error',
      }),
    );
    expect(await screen.findByText('Error: Wrong patient')).toBeInTheDocument();
  });
});
