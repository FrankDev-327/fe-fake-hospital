import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PATIENTS } from '@/mocks/data/patients';
import { WAITING_FOR_BED } from '@/mocks/data/admissions';
import { renderApp } from '@/test/render-app';

const josip = PATIENTS[0]!; // Internal medicine 101 A
const stuck = PATIENTS[15]!; // his discharge timed out in clinical
const stay = () => screen.findByText('Hospital stay');

describe('admissions: admit, move, discharge', () => {
  it('admits a waiting patient to a free bed', async () => {
    const { user } = renderApp(`/patients/${WAITING_FOR_BED[0]}`, {
      as: 'doctor',
    });
    await stay();
    expect(
      await screen.findByText('Sent to the hospital, waiting for a bed.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Admit' }));
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Admit' }));
    expect(within(dialog).getByText('Choose a bed')).toBeInTheDocument();

    await user.selectOptions(
      within(dialog).getByLabelText('Ward'),
      await within(dialog).findByRole('option', { name: 'Surgery' }),
    );
    await user.selectOptions(
      within(dialog).getByLabelText('Bed'),
      await within(dialog).findByRole('option', { name: 'Room 201, bed B' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Admit' }));

    expect(await screen.findByText('Patient admitted')).toBeInTheDocument();
    expect(
      await screen.findByText('Surgery, room 201, bed B'),
    ).toBeInTheDocument();
  });

  it('moves a patient to another bed', async () => {
    const { user } = renderApp(`/patients/${josip.id}`, { as: 'nurse' });
    expect(
      await screen.findByText('Internal medicine, room 101, bed A'),
    ).toBeInTheDocument();
    // nurses move patients but don't discharge
    expect(
      screen.queryByRole('button', { name: 'Discharge' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(
      within(dialog).getByLabelText('Ward'),
      await within(dialog).findByRole('option', { name: 'Internal medicine' }),
    );
    await user.selectOptions(
      within(dialog).getByLabelText('Bed'),
      await within(dialog).findByRole('option', { name: 'Room 102, bed B' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    expect(
      await screen.findByText('Internal medicine, room 102, bed B'),
    ).toBeInTheDocument();
  });

  it('discharges in steps: visit closed, medication stopped, bed free', async () => {
    const { user } = renderApp(`/patients/${josip.id}`, { as: 'doctor' });
    await screen.findByText('Internal medicine, room 101, bed A');
    await user.click(screen.getByRole('button', { name: 'Discharge' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Discharge',
      }),
    );
    expect(
      await screen.findByText('Not in hospital right now.', undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Earlier stays')).toBeInTheDocument();
  });

  it('a stuck discharge can be retried', async () => {
    const { user } = renderApp(`/patients/${stuck.id}`, { as: 'doctor' });
    expect(await screen.findByText('No answer')).toBeInTheDocument();
    expect(screen.getByText(/close_encounter timed out/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(
      () =>
        expect(
          screen.getByText('Not in hospital right now.'),
        ).toBeInTheDocument(),
      { timeout: 4000 },
    );
  });

  it('a stuck discharge can be cancelled: the patient stays', async () => {
    const { user } = renderApp(`/patients/${stuck.id}`, { as: 'doctor' });
    await screen.findByText('No answer');
    await user.click(screen.getByRole('button', { name: 'Cancel discharge' }));
    expect(
      await screen.findByText('Discharge cancelled, patient stays'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Discharge' }),
    ).toBeInTheDocument();
  });
});
