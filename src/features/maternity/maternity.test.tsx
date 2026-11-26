import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PATIENTS } from '@/mocks/data/patients';
import { renderApp } from '@/test/render-app';

const marija = PATIENTS[12]!; // gave birth yesterday
const baby = PATIENTS[13]!; // her baby, no name yet

describe('maternity: labor and births', () => {
  it('nurse registers a birth; the baby gets a chart linked to the mother', async () => {
    const { user } = renderApp('/maternity', { as: 'nurse' });
    await user.click(
      await screen.findByRole('link', { name: 'Pavlović, Lucija' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Register birth' }),
    );
    const dialog = screen.getByRole('dialog');

    // nothing filled: the form says what's missing, no request
    await user.click(within(dialog).getByRole('button', { name: 'Register' }));
    expect(within(dialog).getAllByText('Required')).toHaveLength(3);

    await user.selectOptions(within(dialog).getByLabelText('Sex'), 'Boy');
    await user.selectOptions(
      within(dialog).getByLabelText('Cot'),
      await within(dialog).findByRole('option', {
        name: 'Maternity · room 401 · cot B',
      }),
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Baby's doctor"),
      'Dr. Ana Kovač',
    );
    await user.click(
      await within(dialog).findByLabelText('Ivana Marić (nurse)'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Register' }));

    expect(await screen.findByText('Baby A registered')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    // the team: who registered + who was ticked
    await waitFor(
      () => expect(screen.getAllByText('Ivan Horvat')).toHaveLength(2), // menu + team
    );
    expect(await screen.findByText('Ivana Marić')).toBeInTheDocument();

    await user.click(
      await screen.findByRole('link', { name: 'Open baby A’s chart' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Pavlović, newborn' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No name yet')).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Pavlović, Lucija' }),
    ).toBeInTheDocument();
  });

  it('starts labor only for a mother in a delivery room, and can call it a false alarm', async () => {
    const { user } = renderApp('/maternity', { as: 'doctor' });
    // Lucija is already in labor: nobody waiting to start
    expect(
      await screen.findByText(
        'None of your patients in the delivery ward is waiting.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Pavlović, Lucija' }));
    await user.click(
      await screen.findByRole('button', { name: 'False alarm' }),
    );
    await user.type(screen.getByLabelText('Reason'), 'Braxton-Hicks');
    await user.click(screen.getByRole('button', { name: 'Cancel labor' }));
    expect(await screen.findByText('Labor cancelled')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Maternity' }));
    await user.click(
      await screen.findByRole('button', { name: 'Start labor' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Register birth' }),
    ).toBeInTheDocument();
    expect(screen.getByText('In labor')).toBeInTheDocument();
  });

  it("shows the newborn's birth time, Apgar scores and mother", async () => {
    renderApp(`/patients/${baby.id}`, { as: 'doctor' });
    expect(
      await screen.findByRole('heading', { name: 'Horvat, newborn' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Newborn F · born/)).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Horvat, Marija' }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Apgar 5'")).toBeInTheDocument();
  });

  it('lists delivered mothers', async () => {
    const { user } = renderApp('/maternity', { as: 'doctor' });
    await user.click(await screen.findByRole('tab', { name: 'Delivered' }));
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Horvat, Marija' }),
      ).toBeInTheDocument(),
    );
    expect(marija.lastName).toBe('Horvat');
  });
});
